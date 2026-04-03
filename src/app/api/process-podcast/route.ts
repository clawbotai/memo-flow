import { NextRequest, NextResponse } from 'next/server';
import { fetchEpisodeInfo } from '@/lib/xiaoyuzhou';
import { getWhisperConfig, resolveWhisperConfigPaths } from '@/lib/whisper-config';
import { existsSync } from 'fs';
import { writeFile, mkdir, unlink, readFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import type { TranscribeSegment } from '@/types';
import {
  addTranscriptionRecord,
  updateTranscriptionRecord,
} from '@/lib/transcription-history';
import type { TranscriptionRecord } from '@/types/transcription-history';
import {
  getProgressFilePath,
  writeTranscribeProgress,
} from '@/lib/transcription-progress';
import {
  buildTranscriptFromSegments,
  createWhisperOutputParser,
  parseSrtSegments,
} from '@/lib/transcription-output';
import { saveEpisodeTranscriptionFiles } from '@/lib/transcription-files';

const execFileAsync = promisify(execFile);

// 10 minutes timeout for whisper transcription
const WHISPER_TIMEOUT_MS = 10 * 60 * 1000;

const TEMP_DIR = path.join(os.tmpdir(), 'memo-flow');

/**
 * Convert audio to 16kHz mono WAV using ffmpeg
 */
async function convertToWav(inputPath: string): Promise<string> {
  const wavPath = inputPath.replace(path.extname(inputPath), '.wav');

  await execFileAsync('ffmpeg', [
    '-i', inputPath,
    '-ar', '16000',
    '-ac', '1',
    '-c:a', 'pcm_s16le',
    '-y',
    wavPath,
  ], { timeout: 120000 });

  return wavPath;
}

/**
 * Run whisper via spawn, capturing segments in real-time
 */
function runWhisperStreaming(
  whisperPath: string,
  args: string[],
  onSegment: (segment: TranscribeSegment) => void,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(whisperPath, args);
    const parser = createWhisperOutputParser({ onSegment, onProgress });

    child.stderr.on('data', (data: Buffer) => {
      parser.push(data.toString());
    });

    child.stdout.on('data', (data: Buffer) => {
      parser.push(data.toString());
    });

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('whisper 转录超时（超过 10 分钟）'));
    }, WHISPER_TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timeout);
      parser.flush();
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`whisper 进程退出，退出码: ${code}`));
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Background processing pipeline
 */
async function processInBackground(taskId: string, url: string) {
  let audioPath = '';
  let wavPath = '';

  try {
    // 在开始时创建新的转录记录
    const initialRecord: Omit<TranscriptionRecord, 'id' | 'createdAt' | 'updatedAt'> = {
      taskId,
      title: '未知标题',
      status: 'fetching_info',
      progress: 0,
      segments: [],
    };

    await addTranscriptionRecord(initialRecord);

    // Stage 1: 获取播客信息
    writeTranscribeProgress(taskId, {
      status: 'fetching_info',
      stage: '正在获取播客信息...',
    });

    const episodeInfo = await fetchEpisodeInfo(url);
    if (!episodeInfo.audioUrl) {
      writeTranscribeProgress(taskId, {
        status: 'error',
        stage: '获取失败',
        error: '未能从小宇宙播客中提取到音频链接',
      });

      await updateTranscriptionRecord(taskId, {
        status: 'error',
        progress: null,
      });

      return;
    }

    const audioUrl = episodeInfo.audioUrl;

    // 更新转录记录标题
    await updateTranscriptionRecord(taskId, {
      title: episodeInfo.title,
      audioUrl,
    });

    // Stage 2: 下载音频
    writeTranscribeProgress(taskId, {
      status: 'downloading_audio',
      stage: '正在下载音频文件...',
      audioUrl,
      episodeTitle: episodeInfo.title,
    });

    await updateTranscriptionRecord(taskId, {
      status: 'downloading_audio',
      progress: 10,
    });

    await mkdir(TEMP_DIR, { recursive: true });
    const fileName = `audio_${taskId}.mp3`;
    audioPath = path.join(TEMP_DIR, fileName);

    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      writeTranscribeProgress(taskId, {
        status: 'error',
        stage: '下载失败',
        audioUrl,
        episodeTitle: episodeInfo.title,
        error: '无法下载音频文件',
      });

      await updateTranscriptionRecord(taskId, {
        status: 'error',
        progress: null,
      });

      return;
    }

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    await writeFile(audioPath, audioBuffer);

    // Stage 3: 转换格式
    writeTranscribeProgress(taskId, {
      status: 'converting',
      stage: '正在转换音频格式...',
      audioUrl,
      episodeTitle: episodeInfo.title,
    });

    await updateTranscriptionRecord(taskId, {
      status: 'converting',
      progress: 20,
    });

    wavPath = await convertToWav(audioPath);

    // Stage 4: 转录
    const config = resolveWhisperConfigPaths(getWhisperConfig());
    const segments: TranscribeSegment[] = [];
    let lastWriteTime = 0;
    let currentProgress = 30;

    const flushLiveState = (force = false) => {
      const now = Date.now();
      if (!force && now - lastWriteTime < 500) {
        return;
      }

      lastWriteTime = now;
      const transcript = buildTranscriptFromSegments(segments);
      const snapshot = [...segments];

      writeTranscribeProgress(taskId, {
        status: 'transcribing',
        stage: '正在转录中...',
        audioUrl,
        episodeTitle: episodeInfo.title,
        segments: snapshot,
        transcript,
        progress: currentProgress,
      });

      updateTranscriptionRecord(taskId, {
        segments: snapshot,
        transcript,
        progress: currentProgress,
      }).catch(console.error);
    };

    writeTranscribeProgress(taskId, {
      status: 'transcribing',
      stage: '正在转录中...',
      audioUrl,
      episodeTitle: episodeInfo.title,
      segments: [],
      transcript: '',
      progress: currentProgress,
    });

    await updateTranscriptionRecord(taskId, {
      status: 'transcribing',
      progress: currentProgress,
      transcript: '',
    });

    await runWhisperStreaming(
      config.whisperPath,
      [
        '-m', config.modelPath,
        '-f', wavPath,
        '-l', 'zh',
        '-t', config.threads.toString(),
        '--print-progress',
        '--output-srt',
      ],
      (segment) => {
        segments.push(segment);
        flushLiveState();
      },
      (percent) => {
        currentProgress = percent;
        flushLiveState();
      },
    );
    flushLiveState(true);

    // 读取最终转录文件
    // whisper.cpp --output-srt 生成的文件名是在输入文件名后直接追加 .srt
    // 例如：audio_xxx.wav → audio_xxx.wav.srt
    let finalSegments = [...segments];
    const srtPath = wavPath + '.srt';
    if (existsSync(srtPath)) {
      const srtContent = await readFile(srtPath, 'utf8');
      const srtSegments = parseSrtSegments(srtContent);
      if (srtSegments.length >= finalSegments.length) {
        finalSegments = srtSegments;
      }
      await safeUnlink(srtPath);
    }
    const transcript = buildTranscriptFromSegments(finalSegments).trim();

    // 保存文件到输出目录
    let savedPath = '';
    try {
      savedPath = await saveEpisodeTranscriptionFiles(
        config.outputDir,
        episodeInfo,
        finalSegments,
        transcript,
        url,
      );
    } catch (saveErr) {
      console.error('保存转录文件失败:', saveErr);
    }

    // Stage 5: 完成
    writeTranscribeProgress(taskId, {
      status: 'completed',
      stage: '转录完成',
      audioUrl,
      episodeTitle: episodeInfo.title,
      segments: finalSegments,
      transcript,
      wordCount: transcript.length,
      language: 'zh',
      progress: 100,
      savedPath,
    });

    // 更新转录记录为完成状态
    await updateTranscriptionRecord(taskId, {
      status: 'completed',
      progress: 100,
      transcript,
      wordCount: transcript.length,
      language: 'zh',
      savedPath,
      segments: finalSegments,
    });
  } catch (error) {
    console.error('Background transcription error:', error);
    writeTranscribeProgress(taskId, {
      status: 'error',
      stage: '转录失败',
      error: error instanceof Error ? error.message : '处理播客失败',
    });

    await updateTranscriptionRecord(taskId, {
      status: 'error',
      progress: null,
    });
  } finally {
    // 清理音频临时文件
    await safeUnlink(audioPath);
    await safeUnlink(wavPath);

    // 延迟清理进度文件
    const progressPath = getProgressFilePath(taskId);
    setTimeout(() => safeUnlink(progressPath), 60000);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json(
        { success: false, error: 'URL is required' },
        { status: 400 }
      );
    }

    // 验证 whisper 环境
    const config = resolveWhisperConfigPaths(getWhisperConfig());

    if (!existsSync(config.whisperPath)) {
      return NextResponse.json(
        { success: false, error: 'whisper.cpp 未安装，请在设置中安装' },
        { status: 400 }
      );
    }

    if (!existsSync(config.modelPath)) {
      return NextResponse.json(
        { success: false, error: '模型文件不存在，请在设置中下载模型' },
        { status: 400 }
      );
    }

    // 生成 taskId，启动后台处理
    const taskId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    await mkdir(TEMP_DIR, { recursive: true });
    writeTranscribeProgress(taskId, {
      status: 'idle',
      stage: '准备中...',
    });

    // Fire-and-forget
    processInBackground(taskId, url).catch((err) => {
      console.error('Unhandled background error:', err);
    });

    return NextResponse.json({
      success: true,
      data: { taskId },
    });
  } catch (error) {
    console.error('Process podcast error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '处理播客失败' },
      { status: 500 }
    );
  }
}

async function safeUnlink(filePath: string) {
  if (!filePath) return;
  try {
    if (existsSync(filePath)) await unlink(filePath);
  } catch (e) {
    console.error('Failed to delete temp file:', e);
  }
}
