import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { existsSync } from 'fs';
import { rm, unlink } from 'fs/promises';
import {
  getAllTranscriptionRecords,
  getTranscriptionRecord,
  deleteTranscriptionRecord,
} from '@/lib/transcription-history';
import {
  cancelTranscriptionTask,
  getTranscriptionTask,
} from '@/lib/transcription-task-manager';
import { getProgressFilePath } from '@/lib/transcription-progress';
import { getWhisperConfig, resolveWhisperConfigPaths } from '@/lib/whisper-config';

export const dynamic = 'force-dynamic';

async function safeDeleteFile(filePath: string | undefined) {
  if (!filePath) {
    return false;
  }

  try {
    if (!existsSync(filePath)) {
      return false;
    }

    await unlink(filePath);
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function safeDeleteDirectory(dirPath: string) {
  try {
    if (!existsSync(dirPath)) {
      return false;
    }

    await rm(dirPath, { recursive: true, force: true });
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function isSubPath(parentPath: string, childPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return Boolean(relative) && relative !== '.' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export async function GET(request: NextRequest) {
  try {
    // 解析 URL 参数
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      // 获取特定转录记录详情
      const record = await getTranscriptionRecord(id);

      if (!record) {
        return NextResponse.json(
          { success: false, error: '转录记录不存在' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: record,
      });
    } else {
      // 获取所有转录记录
      const records = await getAllTranscriptionRecords();

      return NextResponse.json({
        success: true,
        data: records,
      });
    }
  } catch (error) {
    console.error('获取转录记录失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '获取转录记录失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID is required' },
        { status: 400 }
      );
    }

    const record = await getTranscriptionRecord(id);
    if (!record) {
      return NextResponse.json(
        { success: false, error: '转录记录不存在' },
        { status: 404 }
      );
    }

    const taskSnapshot = getTranscriptionTask(id);
    const stoppedTask = await cancelTranscriptionTask(id);

    await safeDeleteFile(taskSnapshot?.audioPath);
    await safeDeleteFile(taskSnapshot?.wavPath);
    await safeDeleteFile(taskSnapshot?.srtPath);
    await safeDeleteFile(taskSnapshot?.progressPath ?? getProgressFilePath(id));

    const config = resolveWhisperConfigPaths(getWhisperConfig());
    const outputRoot = path.resolve(config.outputDir);
    const savedPath = record.savedPath ? path.resolve(record.savedPath) : '';

    let deletedOutputDir = false;
    let skippedOutputDir = false;

    if (savedPath) {
      if (isSubPath(outputRoot, savedPath)) {
        deletedOutputDir = await safeDeleteDirectory(savedPath);
      } else {
        skippedOutputDir = true;
      }
    }

    const deleted = await deleteTranscriptionRecord(id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: '转录记录不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '转录记录已删除',
      data: {
        stoppedTask,
        deletedOutputDir,
        skippedOutputDir,
      },
    });
  } catch (error) {
    console.error('删除转录记录失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '删除转录记录失败' },
      { status: 500 }
    );
  }
}
