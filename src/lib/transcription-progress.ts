import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import type { TranscribeProgress } from '@/types';

const TEMP_DIR = path.join(os.tmpdir(), 'memo-flow');

export function getProgressFilePath(taskId: string): string {
  return path.join(TEMP_DIR, `.transcribe-progress-${taskId}.json`);
}

export function writeTranscribeProgress(taskId: string, data: Partial<TranscribeProgress>) {
  const filePath = getProgressFilePath(taskId);

  let existingData: Partial<TranscribeProgress> = {};
  try {
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf8');
      existingData = JSON.parse(content);
    }
  } catch (error) {
    console.warn('读取现有进度文件失败，继续使用新快照:', error);
  }

  const progress: TranscribeProgress = {
    taskId,
    status: 'idle',
    stage: '准备中...',
    segments: [],
    ...existingData,
    ...data,
  };
  progress.segments = data.segments ?? existingData.segments ?? [];

  try {
    const tempPath = `${filePath}.${randomUUID()}.tmp`;
    writeFileSync(tempPath, JSON.stringify(progress), 'utf8');
    renameSync(tempPath, filePath);
  } catch (error) {
    console.error('写入转录进度失败:', error);
  }
}
