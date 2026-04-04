import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// 进度文件路径
const MODELS_DIR = path.join(process.cwd(), 'models');
const PROGRESS_FILE = path.join(MODELS_DIR, '.download-progress.json');

/**
 * 读取进度文件
 */
function readProgress(): {
  status: 'idle' | 'downloading' | 'completed' | 'error';
  downloaded: number;
  total: number;
  modelName: string;
  percent?: number;
  error?: string;
} | null {
  try {
    if (!fs.existsSync(PROGRESS_FILE)) {
      return null;
    }

    const data = fs.readFileSync(PROGRESS_FILE, 'utf8');
    const progress = JSON.parse(data);

    // 计算百分比
    if (progress.total > 0) {
      progress.percent = parseFloat(((progress.downloaded / progress.total) * 100).toFixed(2));
    }

    return progress;
  } catch (error) {
    console.error('读取进度文件失败:', error);
    return null;
  }
}

/**
 * GET /api/whisper-download-progress
 * SSE 推送下载进度
 */
export async function GET() {
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  // 创建可读流
  const stream = new ReadableStream({
    start(controller) {
      let isClosed = false;

      // 发送 SSE 事件的辅助函数
      const sendEvent = (data: object) => {
        if (isClosed) return;
        
        try {
          const message = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch (error) {
          console.error('发送 SSE 事件失败:', error);
        }
      };

      // 关闭连接的辅助函数
      const closeConnection = () => {
        if (isClosed) return;
        isClosed = true;
        
        try {
          controller.close();
        } catch (error) {
          console.error('关闭 SSE 连接失败:', error);
        }
      };

      // 立即发送当前状态
      const initialProgress = readProgress();
      if (initialProgress) {
        sendEvent(initialProgress);
        
        // 如果已经是完成或错误状态，立即关闭
        if (initialProgress.status === 'completed' || initialProgress.status === 'error') {
          closeConnection();
          return;
        }
      } else {
        sendEvent({ status: 'idle', downloaded: 0, total: 0, modelName: '' });
      }

      // 设置定时器，每秒读取进度并推送
      const intervalId = setInterval(() => {
        if (isClosed) {
          clearInterval(intervalId);
          return;
        }

        const progress = readProgress();

        if (!progress) {
          // 进度文件不存在
          sendEvent({ status: 'idle', downloaded: 0, total: 0, modelName: '' });
          return;
        }

        // 发送进度更新
        sendEvent(progress);

        // 如果下载完成或出错，关闭连接
        if (progress.status === 'completed' || progress.status === 'error') {
          clearInterval(intervalId);
          // 延迟一点关闭，确保客户端收到最后一条消息
          setTimeout(closeConnection, 500);
        }
      }, 1000);

      cleanup = () => {
        clearInterval(intervalId);
        closeConnection();
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  // 返回 SSE 响应
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
