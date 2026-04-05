import { NextRequest, NextResponse } from 'next/server';
import {
  getWhisperConfig,
  getWhisperExecutionOptions,
  isValidWhisperExecutable,
  resolveWhisperConfigPaths,
} from '@/lib/whisper-config';
import { existsSync } from 'fs';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import type { TranscribeSegment, TranscriptionEngineType, OnlineASRConfig, WhisperConfig } from '@/types';
import { transcribeWithQwenASR } from '@/lib/qwen-asr';
import {
  getTranscriptionRecord,
  updateTranscriptionRecord,
} from '@/lib/transcription-history';
import {
  getProgressFilePath,
  writeTranscribeProgress,
} from '@/lib/transcription-progress';
import {
  buildTranscriptFromSegments,
  createWhisperOutputParser,
  parseSrtSegments,
} from '@/lib/transcription-output';
import {
  resolveTranscriptOutputDir,
  writeTranscriptTextFiles,
} from '@/lib/transcription-files';
import {
  clearTranscriptionTaskResource,
  completeTranscriptionTask,
  isTranscriptionTaskCancelled,
  isTranscriptionTaskCancelledError,
  registerTranscriptionTask,
  throwIfTranscriptionTaskCancelled,
  TranscriptionTaskCancelledError,
  updateTranscriptionTask,
} from '@/lib/transcription-task-manager';

const WHISPER_TIMEOUT_MS = 30 * 60 * 1000;
const TEMP_DIR = path.join(os.tmpdir(), 'memo-flow');

async function safeUnlink(filePath: string) {
  if (!filePath) return;
  try {
    if (existsSync(filePath)) {
      await unlink(filePath);
    }
  } catch (error) {
    console.error('Failed to delete temp file:', error);
  }
}

function writeTaskProgress(taskId: string, data: Parameters<typeof writeTranscribeProgress>[1]) {
  if (isTranscriptionTaskCancelled(taskId)) {
    return;
  }

  writeTranscribeProgress(taskId, data);
}

async function updateTaskRecord(
  taskId: string,
  updates: Parameters<typeof updateTranscriptionRecord>[1],
) {
  if (isTranscriptionTaskCancelled(taskId)) {
    return null;
  }

  return updateTranscriptionRecord(taskId, updates);
}

async function convertToWav(inputPath: string, ffmpegPath: string, taskId: string): Promise<string> {
  const wavPath = inputPath.replace(path.extname(inputPath), '.wav');

  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, [
      '-i', inputPath,
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      '-y',
      wavPath,
    ], getWhisperExecutionOptions(ffmpegPath));

    updateTranscriptionTask(taskId, {
      status: 'converting',
      ffmpegProcess: child,
      wavPath,
    });

    let stderr = '';
    let settled = false;

    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
      if (stderr.length > 2000) {
        stderr = stderr.slice(-2000);
      }
    });

    child.on('close', (code, signal) => {
      clearTranscriptionTaskResource(taskId, 'ffmpegProcess');

      if (isTranscriptionTaskCancelled(taskId)) {
        rejectOnce(new TranscriptionTaskCancelledError(taskId));
        return;
      }

      if (code === 0) {
        resolveOnce();
        return;
      }

      const reason = code !== null ? `退出码: ${code}` : `信号: ${signal}`;
      rejectOnce(new Error(`ffmpeg 转换失败，${reason}\n错误输出: ${stderr.trim()}`));
    });

    child.on('error', (error) => {
      clearTranscriptionTaskResource(taskId, 'ffmpegProcess');
      if (isTranscriptionTaskCancelled(taskId)) {
        rejectOnce(new TranscriptionTaskCancelledError(taskId));
        return;
      }

      rejectOnce(error);
    });
  });

  return wavPath;
}

interface RunWhisperResult {
  timedOut: boolean;
}

function runWhisperStreaming(
  taskId: string,
  whisperPath: string,
  args: string[],
  onSegment: (segment: TranscribeSegment) => void,
  onProgress: (percent: number) => void,
): Promise<RunWhisperResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(whisperPath, args, getWhisperExecutionOptions(whisperPath));
    const parser = createWhisperOutputParser({ onSegment, onProgress });

    updateTranscriptionTask(taskId, {
      status: 'transcribing',
      whisperProcess: child,
    });

    let errorOutput = '';
    let isTimedOut = false;
    let settled = false;
    let forceKillTimeout: NodeJS.Timeout | null = null;

    const cleanupTimers = () => {
      if (forceKillTimeout) {
        clearTimeout(forceKillTimeout);
        forceKillTimeout = null;
      }
      clearTimeout(timeout);
      clearTranscriptionTaskResource(taskId, 'whisperProcess');
    };

    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanupTimers();
      reject(error);
    };

    const resolveOnce = (result: RunWhisperResult) => {
      if (settled) return;
      settled = true;
      cleanupTimers();
      resolve(result);
    };

    child.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      errorOutput += text;
      if (errorOutput.length > 2000) {
        errorOutput = errorOutput.slice(-2000);
      }
      parser.push(text);
    });

    child.stdout.on('data', (data: Buffer) => {
      parser.push(data.toString());
    });

    const timeout = setTimeout(() => {
      isTimedOut = true;
      child.kill('SIGTERM');

      forceKillTimeout = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
        }
      }, 5000);
    }, WHISPER_TIMEOUT_MS);

    child.on('close', (code, signal) => {
      parser.flush();

      if (isTranscriptionTaskCancelled(taskId)) {
        rejectOnce(new TranscriptionTaskCancelledError(taskId));
        return;
      }

      if (isTimedOut) {
        rejectOnce(new Error(`whisper 转录超时（超过 ${Math.floor(WHISPER_TIMEOUT_MS / 60000)} 分钟）`));
        return;
      }

      if (code === 0) {
        resolveOnce({ timedOut: false });
        return;
      }

      const reason = code !== null ? `退出码: ${code}` : `信号: ${signal}`;
      rejectOnce(new Error(`whisper 进程退出，${reason}\n错误输出: ${errorOutput.trim()}`));
    });

    child.on('error', (error) => {
      if (isTranscriptionTaskCancelled(taskId)) {
        rejectOnce(new TranscriptionTaskCancelledError(taskId));
        return;
      }

      if (isTimedOut) {
        rejectOnce(new Error(`whisper 转录超时（超过 ${Math.floor(WHISPER_TIMEOUT_MS / 60000)} 分钟）`));
        return;
      }

      rejectOnce(error);
    });
  });
}

interface RetranscribeEngineOptions {
  engine: TranscriptionEngineType;
  whisperConfig?: WhisperConfig;
  onlineASRConfig?: OnlineASRConfig;
}

async function retranscribeInBackground(
  taskId: string,
  audioUrl: string,
  title: string,
  previousSavedPath?: string,
  engineOptions?: RetranscribeEngineOptions,
) {
  registerTranscriptionTask(taskId);

  let audioPath = '';
  let wavPath = '';
  let srtPath = '';

  try {
    // ─── 引擎分流 ───
    if (engineOptions?.engine === 'qwen-asr' && engineOptions.onlineASRConfig) {
      // 在线千问 ASR 路径
      writeTaskProgress(taskId, {
        status: 'transcribing',
        stage: '正在使用千问 ASR 在线转录...',
        audioUrl,
        episodeTitle: title,
        segments: [],
        transcript: '',
        progress: 30,
      });

      await updateTaskRecord(taskId, {
        status: 'transcribing',
        progress: 30,
        transcript: '',
      });

      let accumulatedText = '';
      const abortController = new AbortController();
      updateTranscriptionTask(taskId, {
        status: 'transcribing',
        fetchController: abortController,
      });

      const result = await transcribeWithQwenASR(
        audioUrl,
        engineOptions.onlineASRConfig,
        {
          onText: (text) => {
            if (isTranscriptionTaskCancelled(taskId)) return;
            accumulatedText += text;
          },
          onProgress: (percent) => {
            if (isTranscriptionTaskCancelled(taskId)) return;
            writeTaskProgress(taskId, {
              status: 'transcribing',
              stage: '正在使用千问 ASR 在线转录...',
              audioUrl,
              episodeTitle: title,
              transcript: accumulatedText,
              progress: 30 + Math.floor(percent * 0.6),
            });
          },
        },
        abortController.signal,
      );

      clearTranscriptionTaskResource(taskId, 'fetchController');
      throwIfTranscriptionTaskCancelled(taskId);

      if (result.cancelled) return;

      const { segments: finalSegments, transcript } = result;

      let savedPath = previousSavedPath ?? '';
      try {
        const outputDir = resolveTranscriptOutputDir(
          engineOptions.whisperConfig?.outputDir || 'transcripts',
          title,
          previousSavedPath,
        );
        savedPath = await writeTranscriptTextFiles(outputDir, finalSegments, transcript);
      } catch (error) {
        console.error('重新转录写入逐字稿失败:', error);
      }

      throwIfTranscriptionTaskCancelled(taskId);

      writeTaskProgress(taskId, {
        status: 'completed',
        stage: '转录完成',
        audioUrl,
        episodeTitle: title,
        segments: finalSegments,
        transcript,
        wordCount: transcript.length,
        language: 'zh',
        progress: 100,
        savedPath,
      });

      await updateTaskRecord(taskId, {
        status: 'completed',
        progress: 100,
        transcript,
        wordCount: transcript.length,
        language: 'zh',
        savedPath,
        segments: finalSegments,
      });
      return;
    }

    // ─── 本地 Whisper 转录路径 ───
    writeTaskProgress(taskId, {
      status: 'downloading_audio',
      stage: '正在下载音频文件...',
      audioUrl,
      episodeTitle: title,
    });

    await updateTaskRecord(taskId, {
      status: 'downloading_audio',
      progress: 10,
    });

    await mkdir(TEMP_DIR, { recursive: true });
    audioPath = path.join(TEMP_DIR, `audio_${taskId}_retranscribe.mp3`);

    const downloadController = new AbortController();
    updateTranscriptionTask(taskId, {
      status: 'downloading_audio',
      downloadController,
      audioPath,
    });

    const audioResponse = await fetch(audioUrl, {
      signal: downloadController.signal,
    });

    if (!audioResponse.ok) {
      clearTranscriptionTaskResource(taskId, 'downloadController');
      writeTaskProgress(taskId, {
        status: 'error',
        stage: '下载失败',
        audioUrl,
        episodeTitle: title,
        error: '无法下载音频文件',
      });
      await updateTaskRecord(taskId, { status: 'error', progress: null });
      return;
    }

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    clearTranscriptionTaskResource(taskId, 'downloadController');
    throwIfTranscriptionTaskCancelled(taskId);
    await writeFile(audioPath, audioBuffer);

    writeTaskProgress(taskId, {
      status: 'converting',
      stage: '正在转换音频格式...',
      audioUrl,
      episodeTitle: title,
    });

    await updateTaskRecord(taskId, {
      status: 'converting',
      progress: 20,
    });

    const config = engineOptions?.whisperConfig
      ? resolveWhisperConfigPaths(engineOptions.whisperConfig)
      : resolveWhisperConfigPaths(getWhisperConfig());
    wavPath = await convertToWav(audioPath, config.ffmpegPath, taskId);
    srtPath = `${wavPath}.srt`;
    updateTranscriptionTask(taskId, {
      status: 'converting',
      wavPath,
      srtPath,
    });
    throwIfTranscriptionTaskCancelled(taskId);

    const segments: TranscribeSegment[] = [];
    let lastWriteTime = 0;
    let currentProgress = 30;

    const flushLiveState = (force = false) => {
      if (isTranscriptionTaskCancelled(taskId)) {
        return;
      }

      const now = Date.now();
      if (!force && now - lastWriteTime < 500) {
        return;
      }

      lastWriteTime = now;
      const transcript = buildTranscriptFromSegments(segments);
      const snapshot = [...segments];

      writeTaskProgress(taskId, {
        status: 'transcribing',
        stage: '正在转录中...',
        audioUrl,
        episodeTitle: title,
        segments: snapshot,
        transcript,
        progress: currentProgress,
      });

      updateTaskRecord(taskId, {
        segments: snapshot,
        transcript,
        progress: currentProgress,
      }).catch(console.error);
    };

    writeTaskProgress(taskId, {
      status: 'transcribing',
      stage: '正在转录中...',
      audioUrl,
      episodeTitle: title,
      segments: [],
      transcript: '',
      progress: currentProgress,
    });

    await updateTaskRecord(taskId, {
      status: 'transcribing',
      progress: currentProgress,
      transcript: '',
    });

    const { timedOut } = await runWhisperStreaming(
      taskId,
      config.whisperPath,
      [
        '-m', config.modelPath,
        '-f', wavPath,
        '-l', 'zh',
        '-t', config.threads.toString(),
        '--print-progress',
        '--output-srt',
        '-ng',
      ],
      (segment) => {
        if (isTranscriptionTaskCancelled(taskId)) {
          return;
        }

        segments.push(segment);
        flushLiveState();
      },
      (percent) => {
        if (isTranscriptionTaskCancelled(taskId)) {
          return;
        }

        currentProgress = percent;
        flushLiveState();
      },
    );

    throwIfTranscriptionTaskCancelled(taskId);

    if (timedOut) {
      console.warn(`转录任务 ${taskId} 已超时，使用已收集的 ${segments.length} 个片段完成处理`);
    }

    flushLiveState(true);
    throwIfTranscriptionTaskCancelled(taskId);

    let finalSegments = [...segments];
    if (existsSync(srtPath)) {
      const srtContent = await readFile(srtPath, 'utf8');
      const srtSegments = parseSrtSegments(srtContent);
      if (srtSegments.length >= finalSegments.length) {
        finalSegments = srtSegments;
      }
      await safeUnlink(srtPath);
    }

    throwIfTranscriptionTaskCancelled(taskId);
    const transcript = buildTranscriptFromSegments(finalSegments).trim();

    let savedPath = previousSavedPath ?? '';
    try {
      const outputDir = resolveTranscriptOutputDir(config.outputDir, title, previousSavedPath);
      savedPath = await writeTranscriptTextFiles(outputDir, finalSegments, transcript);
    } catch (error) {
      console.error('重新转录写入逐字稿失败:', error);
    }

    throwIfTranscriptionTaskCancelled(taskId);

    writeTaskProgress(taskId, {
      status: 'completed',
      stage: '转录完成',
      audioUrl,
      episodeTitle: title,
      segments: finalSegments,
      transcript,
      wordCount: transcript.length,
      language: 'zh',
      progress: 100,
      savedPath,
    });

    await updateTaskRecord(taskId, {
      status: 'completed',
      progress: 100,
      transcript,
      wordCount: transcript.length,
      language: 'zh',
      savedPath,
      segments: finalSegments,
    });
  } catch (error) {
    if (isTranscriptionTaskCancelledError(error) || isTranscriptionTaskCancelled(taskId)) {
      return;
    }

    console.error('Retranscribe background error:', error);
    writeTaskProgress(taskId, {
      status: 'error',
      stage: '转录失败',
      error: error instanceof Error ? error.message : '重新转录失败',
    });
    await updateTaskRecord(taskId, {
      status: 'error',
      progress: null,
    });
  } finally {
    clearTranscriptionTaskResource(taskId, 'downloadController');

    await safeUnlink(audioPath);
    await safeUnlink(wavPath);
    await safeUnlink(srtPath);

    const progressPath = getProgressFilePath(taskId);
    if (isTranscriptionTaskCancelled(taskId)) {
      await safeUnlink(progressPath);
    } else {
      setTimeout(() => safeUnlink(progressPath), 60000);
    }

    completeTranscriptionTask(taskId);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, engine, whisperConfig: reqWhisperConfig, onlineASRConfig } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: '转录记录 ID 不能为空' },
        { status: 400 },
      );
    }

    const record = await getTranscriptionRecord(id);
    if (!record) {
      return NextResponse.json(
        { success: false, error: '转录记录不存在' },
        { status: 404 },
      );
    }

    if (!record.audioUrl) {
      return NextResponse.json(
        { success: false, error: '该记录没有音频链接，无法重新转录' },
        { status: 400 },
      );
    }

    const engineType: TranscriptionEngineType = engine || 'local-whisper';

    // 引擎前置校验
    if (engineType === 'qwen-asr') {
      if (!onlineASRConfig?.apiKey) {
        return NextResponse.json(
          { success: false, error: '千问 ASR API Key 未配置，请在设置中填写' },
          { status: 400 },
        );
      }
    } else {
      const config = reqWhisperConfig
        ? resolveWhisperConfigPaths(reqWhisperConfig as WhisperConfig)
        : resolveWhisperConfigPaths(getWhisperConfig());
      if (!isValidWhisperExecutable(config.whisperPath)) {
        return NextResponse.json(
          { success: false, error: 'whisper.cpp 未安装，请在设置中安装' },
          { status: 400 },
        );
      }
      if (!existsSync(config.modelPath)) {
        return NextResponse.json(
          { success: false, error: '模型文件不存在，请在设置中下载模型' },
          { status: 400 },
        );
      }
    }

    await updateTranscriptionRecord(id, {
      status: 'downloading_audio',
      progress: 0,
      segments: [],
      transcript: undefined,
      wordCount: undefined,
      language: undefined,
    });

    await mkdir(TEMP_DIR, { recursive: true });
    writeTranscribeProgress(id, {
      status: engineType === 'qwen-asr' ? 'transcribing' : 'downloading_audio',
      stage: '准备重新转录...',
      audioUrl: record.audioUrl,
      episodeTitle: record.title,
    });

    const engineOptions: RetranscribeEngineOptions = {
      engine: engineType,
      whisperConfig: reqWhisperConfig as WhisperConfig | undefined,
      onlineASRConfig: onlineASRConfig as OnlineASRConfig | undefined,
    };

    retranscribeInBackground(id, record.audioUrl, record.title, record.savedPath, engineOptions).catch((error) => {
      console.error('Unhandled retranscribe error:', error);
    });

    return NextResponse.json({
      success: true,
      data: { taskId: id },
    });
  } catch (error) {
    console.error('Retranscribe error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '重新转录失败' },
      { status: 500 },
    );
  }
}
