'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { TEMP_DIR } = require('../app-paths');
const { loadConfig, normalizeWhisperThreads } = require('../config');
const { createRecordUpdateEmitter, addRecord, getRecord } = require('../history');
const { buildWhisperStatus } = require('../runtime/detection');
const { resolveConfigPath } = require('../runtime/path-utils');
const {
  buildTranscriptFromSegments,
  getEstimatedTranscriptionProgress,
  getProgressFromSegment,
  getProgressFromWhisperPercent,
} = require('./segments');
const {
  createTaskContext,
  throwIfCancelled,
  cleanupTaskContext,
} = require('./task-context');
const { fetchEpisodeInfo } = require('./episode-info');
const { transcribeWithQwenFileTrans } = require('./qwen-asr');
const {
  downloadFile,
  convertToWav,
  runWhisperStreaming,
  saveTranscriptionResult,
  parseSrtSegments,
} = require('./audio-pipeline');

async function runEngine(context, record, engine, onlineASRConfig) {
  const updateRecord = createRecordUpdateEmitter(record.id);
  const config = await loadConfig();
  const runtimeStatus = buildWhisperStatus(config);

  if (engine === 'qwen-asr') {
    await updateRecord({
      status: 'transcribing',
      progress: 30,
      segments: [],
      transcript: '',
      error: undefined,
    });

    const result = await transcribeWithQwenFileTrans(
      record.audioUrl,
      onlineASRConfig,
      async (patch) => {
        throwIfCancelled(context);
        const nextTranscript = patch.transcript ?? (await getRecord(record.id))?.transcript ?? '';
        await updateRecord({
          status: 'transcribing',
          progress: patch.progress ?? 30,
          transcript: nextTranscript,
        });
      },
      context.controller.signal,
    );

    throwIfCancelled(context);
    const savedPath = await saveTranscriptionResult(
      { ...(await getRecord(record.id)), savedPath: record.savedPath },
      result.transcript,
      result.segments,
      {
        title: record.title,
        sourceUrl: record.sourceUrl,
      },
      config.outputDir,
    );

    await updateRecord({
      status: 'completed',
      progress: 100,
      transcript: result.transcript,
      segments: result.segments,
      wordCount: result.transcript.length,
      language: 'zh',
      savedPath: path.resolve(savedPath),
      error: undefined,
    });
    return;
  }

  if (!runtimeStatus.effectiveWhisperPath) {
    throw new Error('whisper.cpp 未安装或路径无效，请在设置中填写本机路径');
  }
  if (!runtimeStatus.effectiveFfmpegPath) {
    throw new Error('ffmpeg 未安装或路径无效，请在设置中填写本机路径');
  }
  if (!fs.existsSync(resolveConfigPath(config.modelPath))) {
    throw new Error('模型文件不存在，请先下载模型或手动填写模型路径');
  }

  const audioPath = path.join(TEMP_DIR, `audio_${record.id}.mp3`);
  context.tempFiles.add(audioPath);

  await updateRecord({
    status: 'downloading_audio',
    progress: 10,
    segments: [],
    transcript: '',
    error: undefined,
  });
  await downloadFile(record.audioUrl, audioPath, context.controller.signal);
  throwIfCancelled(context);

  await updateRecord({
    status: 'converting',
    progress: 20,
  });

  const wavPath = await convertToWav(audioPath, runtimeStatus.effectiveFfmpegPath, context);
  throwIfCancelled(context);

  const segments = [];
  let currentProgress = 25;
  const effectiveThreads = normalizeWhisperThreads(config.threads);
  const transcribingStartedAt = Date.now();

  await updateRecord({
    status: 'transcribing',
    progress: currentProgress,
    segments: [],
    transcript: '',
  });

  const estimatedProgressTimer = setInterval(async () => {
    try {
      throwIfCancelled(context);
      const estimatedProgress = getEstimatedTranscriptionProgress(
        Date.now() - transcribingStartedAt,
        record.duration,
      );
      if (estimatedProgress == null || estimatedProgress <= currentProgress) {
        return;
      }

      currentProgress = estimatedProgress;
      await updateRecord({
        status: 'transcribing',
        progress: currentProgress,
        transcript: buildTranscriptFromSegments(segments),
      });
    } catch {}
  }, 5000);

  let srtPath;
  try {
    srtPath = await runWhisperStreaming(
      wavPath,
      {
        ...config,
        threads: effectiveThreads,
      },
      runtimeStatus.effectiveWhisperPath,
      context,
      async (segment) => {
        throwIfCancelled(context);
        segments.push(segment);
        const segmentProgress = getProgressFromSegment(segment.timestamp, record.duration);
        if (segmentProgress != null) {
          currentProgress = Math.max(currentProgress, segmentProgress);
        }
        await updateRecord({
          status: 'transcribing',
          progress: currentProgress,
          segments: [...segments],
          transcript: buildTranscriptFromSegments(segments),
        });
      },
      async (progress) => {
        throwIfCancelled(context);
        currentProgress = Math.max(currentProgress, getProgressFromWhisperPercent(progress));
        await updateRecord({
          status: 'transcribing',
          progress: currentProgress,
          transcript: buildTranscriptFromSegments(segments),
        });
      },
    );
  } finally {
    clearInterval(estimatedProgressTimer);
  }

  let finalSegments = [...segments];
  if (fs.existsSync(srtPath)) {
    const srtContent = await fsp.readFile(srtPath, 'utf8');
    const parsed = parseSrtSegments(srtContent);
    if (parsed.length >= finalSegments.length) {
      finalSegments = parsed;
    }
  }

  const transcript = buildTranscriptFromSegments(finalSegments).trim();
  const savedPath = await saveTranscriptionResult(
    { ...(await getRecord(record.id)), savedPath: record.savedPath },
    transcript,
    finalSegments,
    {
      title: record.title,
      sourceUrl: record.sourceUrl,
      author: record.author,
      pubDate: record.pubDate,
      description: record.description,
    },
    config.outputDir,
  );

  await updateRecord({
    status: 'completed',
    progress: 100,
    transcript,
    segments: finalSegments,
    wordCount: transcript.length,
    language: 'zh',
    savedPath: path.resolve(savedPath),
    error: undefined,
  });
}

async function runNewTranscription(taskId, sourceUrl, engine, onlineASRConfig) {
  const context = createTaskContext(taskId);

  try {
    await addRecord({
      id: taskId,
      taskId,
      title: '未知标题',
      sourceUrl,
      status: 'fetching_info',
      progress: 0,
      segments: [],
    });

    const episode = await fetchEpisodeInfo(sourceUrl, context.controller.signal);
    throwIfCancelled(context);

    const updateRecord = createRecordUpdateEmitter(taskId);
    await updateRecord({
      title: episode.title,
      audioUrl: episode.audioUrl,
      duration: episode.duration,
      sourceUrl,
      author: episode.author,
      pubDate: episode.pubDate,
      description: episode.description,
    });

    await runEngine(
      context,
      {
        id: taskId,
        title: episode.title,
        audioUrl: episode.audioUrl,
        sourceUrl,
        author: episode.author,
        pubDate: episode.pubDate,
        description: episode.description,
      },
      engine,
      onlineASRConfig,
    );
  } catch (error) {
    const updateRecord = createRecordUpdateEmitter(taskId);
    await updateRecord({
      status: 'error',
      progress: null,
      error:
        error?.code === 'TASK_CANCELLED' || error?.message === '任务已取消'
          ? '任务已取消'
          : error instanceof Error
            ? error.message
            : '处理播客失败',
    });
  } finally {
    await cleanupTaskContext(context);
  }
}

async function runRetranscription(taskId, engine, onlineASRConfig) {
  const record = await getRecord(taskId);
  if (!record) {
    throw new Error('转录记录不存在');
  }
  if (!record.audioUrl) {
    throw new Error('该记录没有音频链接，无法重新转录');
  }

  const context = createTaskContext(taskId);
  const updateRecord = createRecordUpdateEmitter(taskId);

  try {
    await updateRecord({
      status: engine === 'qwen-asr' ? 'transcribing' : 'downloading_audio',
      progress: 0,
      segments: [],
      transcript: '',
      wordCount: undefined,
      language: undefined,
      error: undefined,
    });

    await runEngine(
      context,
      {
        ...record,
        savedPath: record.savedPath,
      },
      engine,
      onlineASRConfig,
    );
  } catch (error) {
    await updateRecord({
      status: 'error',
      progress: null,
      error:
        error?.code === 'TASK_CANCELLED' || error?.message === '任务已取消'
          ? '任务已取消'
          : error instanceof Error
            ? error.message
            : '重新转录失败',
    });
  } finally {
    await cleanupTaskContext(context);
  }
}

module.exports = {
  runEngine,
  runNewTranscription,
  runRetranscription,
};
