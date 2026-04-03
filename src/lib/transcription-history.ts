import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { TranscriptionRecord, TranscriptionHistoryState } from '../types/transcription-history';

const HISTORY_FILE_NAME = '.transcription-history.json';
const HISTORY_DIR = path.join(os.tmpdir(), 'memo-flow');
const EMPTY_HISTORY_STATE: TranscriptionHistoryState = {
  records: [],
  lastUpdated: new Date(0),
};

let lastKnownGoodHistory: TranscriptionHistoryState = EMPTY_HISTORY_STATE;
let mutationQueue: Promise<unknown> = Promise.resolve();

function cloneHistoryState(state: TranscriptionHistoryState): TranscriptionHistoryState {
  return {
    ...state,
    lastUpdated: new Date(state.lastUpdated),
    records: state.records.map((record) => ({
      ...record,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
    })),
  };
}

function deserializeHistoryState(content: string): TranscriptionHistoryState {
  const state = JSON.parse(content) as TranscriptionHistoryState;

  return {
    ...state,
    lastUpdated: new Date(state.lastUpdated),
    records: state.records.map((record) => ({
      ...record,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
    })),
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readHistoryFileWithRetry(historyPath: string): Promise<TranscriptionHistoryState> {
  const retryDelays = [15, 40, 80];

  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    try {
      const content = await fs.readFile(historyPath, 'utf-8');
      const state = deserializeHistoryState(content);
      lastKnownGoodHistory = cloneHistoryState(state);
      return state;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;

      if (err.code === 'ENOENT') {
        const emptyState = {
          records: [],
          lastUpdated: new Date(),
        };
        lastKnownGoodHistory = cloneHistoryState(emptyState);
        return emptyState;
      }

      const isJsonRace = error instanceof SyntaxError || err.name === 'SyntaxError';
      if (isJsonRace && attempt < retryDelays.length) {
        await sleep(retryDelays[attempt]);
        continue;
      }

      if (isJsonRace && lastKnownGoodHistory.records.length > 0) {
        console.warn('历史记录文件读取到不完整 JSON，回退到最近一次有效快照。');
        return cloneHistoryState(lastKnownGoodHistory);
      }

      throw error;
    }
  }

  return cloneHistoryState(lastKnownGoodHistory);
}

async function withMutationLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = mutationQueue.then(operation, operation);
  mutationQueue = run.then(() => undefined, () => undefined);
  return run;
}

export async function ensureHistoryDir(): Promise<void> {
  try {
    await fs.mkdir(HISTORY_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create history directory:', error);
    throw error;
  }
}

export async function getHistoryFilePath(): Promise<string> {
  await ensureHistoryDir();
  return path.join(HISTORY_DIR, HISTORY_FILE_NAME);
}

export async function loadTranscriptionHistory(): Promise<TranscriptionHistoryState> {
  try {
    const historyPath = await getHistoryFilePath();
    return await readHistoryFileWithRetry(historyPath);
  } catch (error) {
    console.error('Failed to load transcription history:', error);
    throw error;
  }
}

export async function saveTranscriptionHistory(state: TranscriptionHistoryState): Promise<void> {
  try {
    const historyPath = await getHistoryFilePath();
    const serializableState = {
      ...state,
      lastUpdated: state.lastUpdated.toISOString(),
      records: state.records.map((record) => ({
        ...record,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      })),
    };

    const tempPath = `${historyPath}.${randomUUID()}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(serializableState, null, 2), 'utf8');
    await fs.rename(tempPath, historyPath);
    lastKnownGoodHistory = cloneHistoryState(state);
  } catch (error) {
    console.error('Failed to save transcription history:', error);
    throw error;
  }
}

export async function addTranscriptionRecord(
  record: Omit<TranscriptionRecord, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<TranscriptionRecord> {
  return withMutationLock(async () => {
    const history = await loadTranscriptionHistory();
    const newRecord: TranscriptionRecord = {
      ...record,
      id: record.taskId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    history.records = [newRecord, ...history.records];
    history.lastUpdated = new Date();

    await saveTranscriptionHistory(history);
    return newRecord;
  });
}

export async function updateTranscriptionRecord(
  id: string,
  updates: Partial<Omit<TranscriptionRecord, 'id' | 'taskId' | 'createdAt'>>,
): Promise<TranscriptionRecord | null> {
  return withMutationLock(async () => {
    const history = await loadTranscriptionHistory();
    const recordIndex = history.records.findIndex((record) => record.id === id);

    if (recordIndex === -1) {
      return null;
    }

    history.records[recordIndex] = {
      ...history.records[recordIndex],
      ...updates,
      updatedAt: new Date(),
    };

    history.lastUpdated = new Date();
    await saveTranscriptionHistory(history);
    return history.records[recordIndex];
  });
}

export async function getTranscriptionRecord(id: string): Promise<TranscriptionRecord | null> {
  const history = await loadTranscriptionHistory();
  return history.records.find((record) => record.id === id) || null;
}

export async function getAllTranscriptionRecords(): Promise<TranscriptionRecord[]> {
  const history = await loadTranscriptionHistory();
  return history.records;
}

export async function deleteTranscriptionRecord(id: string): Promise<boolean> {
  return withMutationLock(async () => {
    const history = await loadTranscriptionHistory();
    const initialLength = history.records.length;
    history.records = history.records.filter((record) => record.id !== id);

    if (initialLength !== history.records.length) {
      history.lastUpdated = new Date();
      await saveTranscriptionHistory(history);
      return true;
    }

    return false;
  });
}
