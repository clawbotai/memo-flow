import type { ChildProcess } from 'child_process';
import { getProgressFilePath } from '@/lib/transcription-progress';

type ManagedProcessKey = 'ffmpegProcess' | 'whisperProcess';
type ManagedControllerKey = 'fetchController' | 'downloadController';

interface ManagedTaskState {
  taskId: string;
  status?: string;
  fetchController?: AbortController;
  downloadController?: AbortController;
  ffmpegProcess?: ChildProcess;
  whisperProcess?: ChildProcess;
  audioPath?: string;
  wavPath?: string;
  srtPath?: string;
  progressPath: string;
  cancelled: boolean;
  donePromise: Promise<void>;
  resolveDone: (value?: void | PromiseLike<void>) => void;
}

export interface TranscriptionTaskSnapshot {
  taskId: string;
  status?: string;
  audioPath?: string;
  wavPath?: string;
  srtPath?: string;
  progressPath: string;
  cancelled: boolean;
}

export class TranscriptionTaskCancelledError extends Error {
  constructor(taskId: string) {
    super(`转录任务已取消: ${taskId}`);
    this.name = 'TranscriptionTaskCancelledError';
  }
}

const tasks = new Map<string, ManagedTaskState>();

function killProcess(child?: ChildProcess) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
  }, 5000);
}

export function registerTranscriptionTask(taskId: string) {
  const existing = tasks.get(taskId);
  if (existing) {
    existing.resolveDone();
    tasks.delete(taskId);
  }

  let resolveDone: ManagedTaskState['resolveDone'] = () => undefined;
  const donePromise = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  tasks.set(taskId, {
    taskId,
    progressPath: getProgressFilePath(taskId),
    cancelled: false,
    donePromise,
    resolveDone,
  });
}

export function updateTranscriptionTask(
  taskId: string,
  patch: Partial<
    Pick<
      ManagedTaskState,
      | 'status'
      | 'fetchController'
      | 'downloadController'
      | 'ffmpegProcess'
      | 'whisperProcess'
      | 'audioPath'
      | 'wavPath'
      | 'srtPath'
    >
  >,
) {
  const task = tasks.get(taskId);
  if (!task) {
    return;
  }

  Object.assign(task, patch);
}

export function clearTranscriptionTaskResource(
  taskId: string,
  key: ManagedProcessKey | ManagedControllerKey,
) {
  const task = tasks.get(taskId);
  if (!task) {
    return;
  }

  delete task[key];
}

export function getTranscriptionTask(taskId: string): TranscriptionTaskSnapshot | null {
  const task = tasks.get(taskId);
  if (!task) {
    return null;
  }

  return {
    taskId: task.taskId,
    status: task.status,
    audioPath: task.audioPath,
    wavPath: task.wavPath,
    srtPath: task.srtPath,
    progressPath: task.progressPath,
    cancelled: task.cancelled,
  };
}

export function isTranscriptionTaskCancelled(taskId: string): boolean {
  return tasks.get(taskId)?.cancelled ?? false;
}

export function throwIfTranscriptionTaskCancelled(taskId: string) {
  if (isTranscriptionTaskCancelled(taskId)) {
    throw new TranscriptionTaskCancelledError(taskId);
  }
}

export function isTranscriptionTaskCancelledError(error: unknown): error is TranscriptionTaskCancelledError {
  return error instanceof TranscriptionTaskCancelledError;
}

export async function cancelTranscriptionTask(taskId: string): Promise<boolean> {
  const task = tasks.get(taskId);
  if (!task) {
    return false;
  }

  if (!task.cancelled) {
    task.cancelled = true;
    task.fetchController?.abort();
    task.downloadController?.abort();
    killProcess(task.ffmpegProcess);
    killProcess(task.whisperProcess);
  }

  await task.donePromise;
  return true;
}

export function completeTranscriptionTask(taskId: string) {
  const task = tasks.get(taskId);
  if (!task) {
    return;
  }

  task.resolveDone();
  tasks.delete(taskId);
}
