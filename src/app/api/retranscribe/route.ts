import { NextRequest, NextResponse } from 'next/server';
import { getWhisperConfig, resolveWhisperConfigPaths } from '@/lib/whisper-config';
import { existsSync } from 'fs';
import { writeFile, mkdir, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { TranscribeSegment } from '@/types';
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

const execFileAsync = promisify(execFile);
const WHISPER_TIMEOUT_MS = 10 * 60 * 1000;
const TEMP_DIR = path.join(os.tmpdir(), 'memo-flow');

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

async function safeUnlink(filePath: string) {
  if (!filePath) return;
  try {
    if (existsSync(filePath)) await unlink(filePath);
  } catch (e) {
    console.error('Failed to delete temp file:', e);
  }
}

/**
 * 重新转录的后台处理流程
 * 跳过播客信息获取，直接使用已有的 audioUrl 下载并转录
 */
async function retranscribeInBackground(
  taskId: string,
  audioUrl: string,
  title: string,
  previousSavedPath?: string,
) {
  let audioPath = '';
  let wavPath = '';

  try {
    // Stage 1: 下载音频
    writeTranscribeProgress(taskId, {
      status: 'downloading_audio',
      stage: '正在下载音频文件...',
      audioUrl,
      episodeTitle: title,
    });

    await updateTranscriptionRecord(taskId, {
      status: 'downloading_audio',
      progress: 10,
    });

    await mkdir(TEMP_DIR, { recursive: true });
    const fileName = `audio_${taskId}_retranscribe.mp3`;
    audioPath = path.join(TEMP_DIR, fileName);

    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      writeTranscribeProgress(taskId, {
        status: 'error',
        stage: '下载失败',
        audioUrl,
        episodeTitle: title,
        error: '无法下载音频文件',
      });
      await updateTranscriptionRecord(taskId, { status: 'error', progress: null });
      return;
    }

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    await writeFile(audioPath, audioBuffer);

    // Stage 2: 转换格式
    writeTranscribeProgress(taskId, {
      status: 'converting',
      stage: '正在转换音频格式...',
      audioUrl,
      episodeTitle: title,
    });

    await updateTranscriptionRecord(taskId, { status: 'converting', progress: 20 });

    wavPath = await convertToWav(audioPath);

    // Stage 3: 转录
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
        episodeTitle: title,
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
      episodeTitle: title,
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
    let finalSegments = [...segments];
    const srtPath = wavPath + '.srt';
    if (existsSync(srtPath)) {
      const { readFile } = await import('fs/promises');
      const srtContent = await readFile(srtPath, 'utf8');
      const srtSegments = parseSrtSegments(srtContent);
      if (srtSegments.length >= finalSegments.length) {
        finalSegments = srtSegments;
      }
      await safeUnlink(srtPath);
    }
    const transcript = buildTranscriptFromSegments(finalSegments).trim();

    let savedPath = previousSavedPath ?? '';
    try {
      const outputDir = resolveTranscriptOutputDir(config.outputDir, title, previousSavedPath);
      savedPath = await writeTranscriptTextFiles(outputDir, finalSegments, transcript);
    } catch (saveErr) {
      console.error('重新转录写入逐字稿失败:', saveErr);
    }

    // Stage 4: 完成
    writeTranscribeProgress(taskId, {
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
    console.error('Retranscribe background error:', error);
    writeTranscribeProgress(taskId, {
      status: 'error',
      stage: '转录失败',
      error: error instanceof Error ? error.message : '重新转录失败',
    });
    await updateTranscriptionRecord(taskId, { status: 'error', progress: null });
  } finally {
    await safeUnlink(audioPath);
    await safeUnlink(wavPath);

    const progressPath = getProgressFilePath(taskId);
    setTimeout(() => safeUnlink(progressPath), 60000);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json(
        { success: false, error: '转录记录 ID 不能为空' },
        { status: 400 }
      );
    }

    // 获取现有记录
    const record = await getTranscriptionRecord(id);
    if (!record) {
      return NextResponse.json(
        { success: false, error: '转录记录不存在' },
        { status: 404 }
      );
    }

    if (!record.audioUrl) {
      return NextResponse.json(
        { success: false, error: '该记录没有音频链接，无法重新转录' },
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

    // 重置记录状态
    await updateTranscriptionRecord(id, {
      status: 'downloading_audio',
      progress: 0,
      segments: [],
      transcript: undefined,
      wordCount: undefined,
      language: undefined,
    });

    // 初始化进度文件
    await mkdir(TEMP_DIR, { recursive: true });
    writeTranscribeProgress(id, {
      status: 'downloading_audio',
      stage: '准备重新转录...',
      audioUrl: record.audioUrl,
      episodeTitle: record.title,
    });

    // Fire-and-forget 后台处理
    retranscribeInBackground(id, record.audioUrl, record.title, record.savedPath).catch((err) => {
      console.error('Unhandled retranscribe error:', err);
    });

    return NextResponse.json({
      success: true,
      data: { taskId: id },
    });
  } catch (error) {
    console.error('Retranscribe error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '重新转录失败' },
      { status: 500 }
    );
  }
}
