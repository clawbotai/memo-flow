import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const PROGRESS_FILE = path.join(process.cwd(), '.ffmpeg-install-progress.json');

interface InstallProgress {
  status: 'idle' | 'installing' | 'completed' | 'error';
  step: string;
  error?: string;
}

function readProgress(): InstallProgress | null {
  try {
    if (!fs.existsSync(PROGRESS_FILE)) return null;
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

export async function GET() {
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let isClosed = false;

      const sendEvent = (data: object) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // ignore
        }
      };

      const closeConnection = () => {
        if (isClosed) return;
        isClosed = true;
        try {
          controller.close();
        } catch {
          // ignore
        }
      };

      // Send initial state
      const initial = readProgress();
      if (initial) {
        sendEvent(initial);
        if (initial.status === 'completed' || initial.status === 'error') {
          closeConnection();
          return;
        }
      } else {
        sendEvent({ status: 'idle', step: '' });
      }

      // Poll every second
      const intervalId = setInterval(() => {
        if (isClosed) {
          clearInterval(intervalId);
          return;
        }

        const progress = readProgress();
        if (!progress) {
          sendEvent({ status: 'idle', step: '' });
          return;
        }

        sendEvent(progress);

        if (progress.status === 'completed' || progress.status === 'error') {
          clearInterval(intervalId);
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

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
