import { NextRequest, NextResponse } from 'next/server';
import {
  getTranscriptionRecord,
} from '@/lib/transcription-history';
import { existsSync, readFileSync } from 'fs';
import { getProgressFilePath } from '@/lib/transcription-progress';

export const dynamic = 'force-dynamic';

/** 合并进度文件数据到记录中 */
function mergeProgressFile(record: Record<string, unknown>, taskId: string): Record<string, unknown> {
  const progressFilePath = getProgressFilePath(taskId);
  if (!existsSync(progressFilePath)) return record;

  try {
    const progressData = JSON.parse(readFileSync(progressFilePath, 'utf-8'));
    return {
      ...record,
      status: progressData.status || record.status,
      progress: progressData.progress ?? record.progress,
      // 优先取 segments 较多的那份，避免回退
      segments:
        (progressData.segments?.length ?? 0) >= ((record.segments as unknown[])?.length ?? 0)
          ? progressData.segments
          : record.segments,
      transcript: progressData.transcript ?? record.transcript,
      audioUrl: progressData.audioUrl ?? record.audioUrl,
      wordCount: progressData.wordCount ?? record.wordCount,
      language: progressData.language ?? record.language,
      savedPath: progressData.savedPath ?? record.savedPath,
    };
  } catch (e) {
    console.error('解析进度文件失败:', e);
    return record;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
  }

  const initialRecord = await getTranscriptionRecord(id);
  if (!initialRecord) {
    return NextResponse.json({ success: false, error: '转录记录不存在' }, { status: 404 });
  }

  let closed = false;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      function send(data: unknown) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // controller already closed
        }
      }

      // 立即发送初始数据
      const mergedInitial = mergeProgressFile(initialRecord as unknown as Record<string, unknown>, id);
      send({ success: true, data: mergedInitial });

      // 如果已完成或出错，直接关闭（此时 interval 尚未赋值，但已安全声明）
      if (mergedInitial.status === 'completed' || mergedInitial.status === 'error') {
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
        return;
      }

      // 每 800ms 推送一次最新数据
      const interval = setInterval(async () => {
        try {
          const record = await getTranscriptionRecord(id);
          if (!record) {
            send({ success: false, error: '转录记录不存在' });
            close();
            return;
          }

          const current = mergeProgressFile(record as unknown as Record<string, unknown>, id);
          send({ success: true, data: current });

          if (current.status === 'completed' || current.status === 'error') {
            close();
          }
        } catch (err) {
          console.error('推送实时更新失败:', err);
          send({ success: false, error: '获取更新失败，正在自动重试' });
        }
      }, 800);

      function close() {
        if (closed) return;
        closed = true;
        clearInterval(interval);
        try { controller.close(); } catch { /* already closed */ }
      }

      // 客户端断开时清理
      request.signal.addEventListener('abort', () => close());
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
