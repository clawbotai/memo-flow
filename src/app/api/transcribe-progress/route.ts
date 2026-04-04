import fs from 'fs';
import path from 'path';
import os from 'os';
import type { TranscribeProgress } from '@/types';

export const dynamic = 'force-dynamic';

const TEMP_DIR = path.join(os.tmpdir(), 'memo-flow');

function getProgressFilePath(taskId: string): string {
  return path.join(TEMP_DIR, `.transcribe-progress-${taskId}.json`);
}

function readProgress(taskId: string): TranscribeProgress | null {
  try {
    const filePath = getProgressFilePath(taskId);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('读取转录进度失败:', error);
    return null;
  }
}

/**
 * GET /api/transcribe-progress?taskId=xxx
 * SSE 推送转录进度
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');

  if (!taskId || !/^[a-zA-Z0-9_]+$/.test(taskId)) {
    return new Response(JSON.stringify({ error: 'Invalid taskId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let isClosed = false;
      let intervalId: ReturnType<typeof setInterval> | null = null;

      const handleAbort = () => {
        closeConnection();
      };

      const sendEvent = (data: object) => {
        if (isClosed) return;
        try {
          const message = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch {
          // controller 已关闭，标记状态防止后续写入
          isClosed = true;
        }
      };

      const closeConnection = () => {
        if (isClosed) return;
        isClosed = true;

        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }

        request.signal.removeEventListener('abort', handleAbort);

        try {
          controller.close();
        } catch {
          // controller 可能已经被框架关闭，直接忽略
        }
      };

      request.signal.addEventListener('abort', handleAbort);

      // 立即发送当前状态
      const initialProgress = readProgress(taskId);
      if (initialProgress) {
        sendEvent(initialProgress);
        if (initialProgress.status === 'completed' || initialProgress.status === 'error') {
          setTimeout(closeConnection, 100);
          return;
        }
      } else {
        sendEvent({ taskId, status: 'idle', stage: '准备中...', segments: [] });
      }

      // 每秒轮询进度文件
      intervalId = setInterval(() => {
        if (isClosed) {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
          return;
        }

        const progress = readProgress(taskId);

        if (!progress) {
          sendEvent({ taskId, status: 'idle', stage: '准备中...', segments: [] });
          return;
        }

        sendEvent(progress);

        if (progress.status === 'completed' || progress.status === 'error') {
          setTimeout(closeConnection, 100);
        }
      }, 1000);

      cleanup = () => {
        closeConnection();
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
