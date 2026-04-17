'use strict';

const fsp = require('fs/promises');
const path = require('path');
const { createHash } = require('crypto');
const {
  PLAIN_TRANSCRIPT_FILE,
  TIMESTAMPED_TRANSCRIPT_FILE,
  MINDMAP_FILE,
  CONTENT_POINTS_FILE,
  CONTENT_DRAFTS_FILE,
} = require('./constants');
const { APP_DIR, HISTORY_FILE, ensureAppDirs } = require('./app-paths');
const { writeSse } = require('./cors-sse');
const { normalizeLineBreaks } = require('./text-utils');
const state = require('./state');

function toIsoDate(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function serializeRecord(record) {
  const exportState = record?.exportState && typeof record.exportState === 'object'
    ? Object.fromEntries(
        Object.entries(record.exportState).map(([providerId, state]) => [
          providerId,
          state && typeof state === 'object'
            ? {
                ...state,
                exportedAt: toIsoDate(state.exportedAt),
              }
            : state,
        ]),
      )
    : undefined;

  return {
    ...record,
    createdAt: toIsoDate(record.createdAt),
    updatedAt: toIsoDate(record.updatedAt),
    exportState,
  };
}

function normalizeSavedPath(inputPath) {
  if (!inputPath) return '';
  return path.resolve(String(inputPath));
}

function buildImportedRecordId(savedPath) {
  const normalizedPath = normalizeSavedPath(savedPath);
  const digest = createHash('sha1').update(normalizedPath).digest('hex').slice(0, 16);
  return `import_${digest}`;
}

function isActiveTranscriptionStatus(status) {
  return (
    status === 'fetching_info' ||
    status === 'downloading_audio' ||
    status === 'converting' ||
    status === 'transcribing'
  );
}

async function loadHistory() {
  await ensureAppDirs();
  try {
    const raw = await fsp.readFile(HISTORY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.records)) {
      return { records: [], lastUpdated: new Date().toISOString() };
    }
    return {
      records: parsed.records,
      lastUpdated: parsed.lastUpdated || new Date().toISOString(),
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { records: [], lastUpdated: new Date().toISOString() };
    }
    throw error;
  }
}

async function saveHistory(history) {
  await ensureAppDirs();
  const tempFile = `${HISTORY_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tempFile, JSON.stringify(history, null, 2), 'utf8');
  await fsp.rename(tempFile, HISTORY_FILE);
}

function runWithHistoryMutation(task) {
  const next = state.historyMutationChain.catch(() => {}).then(task);
  state.historyMutationChain = next.catch(() => {});
  return next;
}

function getLiveClientSet(taskId) {
  if (!state.liveClients.has(taskId)) {
    state.liveClients.set(taskId, new Set());
  }
  return state.liveClients.get(taskId);
}

function emitRecord(taskId, record) {
  const clients = state.liveClients.get(taskId);
  if (!clients) return;
  for (const res of clients) {
    if (!writeSse(res, { success: true, data: record })) {
      clients.delete(res);
    }
  }
}

function closeLiveClients(taskId) {
  const clients = state.liveClients.get(taskId);
  if (!clients) return;
  for (const res of clients) {
    try {
      res.end();
    } catch {}
  }
  state.liveClients.delete(taskId);
}

function createRecordUpdateEmitter(taskId) {
  return async function emitRecordPatch(updates) {
    return runWithHistoryMutation(async () => {
      const history = await loadHistory();
      const index = history.records.findIndex((record) => record.id === taskId);
      if (index === -1) {
        return null;
      }

      history.records[index] = serializeRecord({
        ...history.records[index],
        ...updates,
        updatedAt: new Date(),
      });
      history.lastUpdated = new Date().toISOString();
      await saveHistory(history);
      emitRecord(taskId, history.records[index]);
      return history.records[index];
    });
  };
}

async function addRecord(record) {
  return runWithHistoryMutation(async () => {
    const history = await loadHistory();
    const nextRecord = serializeRecord({
      ...record,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    history.records = [nextRecord, ...history.records.filter((item) => item.id !== nextRecord.id)];
    history.lastUpdated = new Date().toISOString();
    await saveHistory(history);
    emitRecord(nextRecord.id, nextRecord);
    return nextRecord;
  });
}

async function getRecord(id) {
  const history = await loadHistory();
  return history.records.find((record) => record.id === id) || null;
}

async function listRecords() {
  const history = await loadHistory();
  return history.records.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

async function removeRecord(id) {
  return runWithHistoryMutation(async () => {
    const history = await loadHistory();
    const record = history.records.find((item) => item.id === id);
    history.records = history.records.filter((item) => item.id !== id);
    history.lastUpdated = new Date().toISOString();
    await saveHistory(history);
    closeLiveClients(id);
    return record || null;
  });
}

async function reconcileInterruptedRecords() {
  const history = await loadHistory();
  let changed = false;

  history.records = history.records.map((record) => {
    if (!isActiveTranscriptionStatus(record.status)) {
      return record;
    }

    changed = true;
    return serializeRecord({
      ...record,
      status: 'error',
      progress: null,
      error: 'helper 已重启，之前的转录任务已中断，请重新转录。',
      updatedAt: new Date(),
    });
  });

  if (changed) {
    history.lastUpdated = new Date().toISOString();
    await saveHistory(history);
  }
}

async function getFileMtimeMs(filePath) {
  try {
    const stats = await fsp.stat(filePath);
    return stats.mtimeMs;
  } catch {
    return null;
  }
}

function formatSecondsToImportTimestamp(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = Math.floor(safeSeconds % 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.000`;
}

function parseTimestampedTranscriptContent(content) {
  const lines = normalizeLineBreaks(String(content || ''))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return { transcript: '', segments: [] };
  }

  const parsedLines = [];
  let isStrictlyFormatted = true;

  for (const line of lines) {
    const match = line.match(/^(\d{2}):(\d{2})\t(.+)$/);
    if (!match) {
      isStrictlyFormatted = false;
      break;
    }

    const minutes = Number.parseInt(match[1], 10);
    const seconds = Number.parseInt(match[2], 10);
    parsedLines.push({
      startSeconds: minutes * 60 + seconds,
      text: match[3].trim(),
    });
  }

  if (!isStrictlyFormatted) {
    return {
      transcript: lines
        .map((line) => {
          const parts = line.split('\t');
          return parts.length > 1 ? parts.slice(1).join('\t').trim() : line;
        })
        .filter(Boolean)
        .join('\n'),
      segments: [],
    };
  }

  const segments = parsedLines.map((line, index) => {
    const nextLine = parsedLines[index + 1];
    const endSeconds = nextLine ? Math.max(line.startSeconds + 1, nextLine.startSeconds) : line.startSeconds + 1;

    return {
      timestamp: `[${formatSecondsToImportTimestamp(line.startSeconds)} --> ${formatSecondsToImportTimestamp(endSeconds)}]`,
      text: line.text,
    };
  });

  return {
    transcript: parsedLines.map((line) => line.text).join('\n'),
    segments,
  };
}

async function buildImportedRecordFromDirectory(directoryPath) {
  const savedPath = normalizeSavedPath(directoryPath);
  const title = path.basename(savedPath);
  const plainTextPath = path.join(savedPath, PLAIN_TRANSCRIPT_FILE);
  const timestampedTextPath = path.join(savedPath, TIMESTAMPED_TRANSCRIPT_FILE);
  const mindmapPath = path.join(savedPath, MINDMAP_FILE);
  const contentPointsPath = path.join(savedPath, CONTENT_POINTS_FILE);
  const contentDraftsPath = path.join(savedPath, CONTENT_DRAFTS_FILE);

  const [plainTextExists, timestampedTextExists, mindmapExists, contentPointsExists, contentDraftsExists] = await Promise.all([
    fsp.access(plainTextPath).then(() => true).catch(() => false),
    fsp.access(timestampedTextPath).then(() => true).catch(() => false),
    fsp.access(mindmapPath).then(() => true).catch(() => false),
    fsp.access(contentPointsPath).then(() => true).catch(() => false),
    fsp.access(contentDraftsPath).then(() => true).catch(() => false),
  ]);

  if (!plainTextExists && !timestampedTextExists) {
    return null;
  }

  let transcript = '';
  let segments = [];

  if (timestampedTextExists) {
    const timestampedContent = await fsp.readFile(timestampedTextPath, 'utf8');
    const parsedTimestamped = parseTimestampedTranscriptContent(timestampedContent);
    transcript = parsedTimestamped.transcript;
    segments = parsedTimestamped.segments;
  }

  if (plainTextExists) {
    transcript = (await fsp.readFile(plainTextPath, 'utf8')).trim();
  } else {
    transcript = transcript.trim();
  }

  const [
    plainTextMtime,
    timestampedTextMtime,
    mindmapMtime,
    contentPointsMtime,
    contentDraftsMtime,
  ] = await Promise.all([
    plainTextExists ? getFileMtimeMs(plainTextPath) : Promise.resolve(null),
    timestampedTextExists ? getFileMtimeMs(timestampedTextPath) : Promise.resolve(null),
    mindmapExists ? getFileMtimeMs(mindmapPath) : Promise.resolve(null),
    contentPointsExists ? getFileMtimeMs(contentPointsPath) : Promise.resolve(null),
    contentDraftsExists ? getFileMtimeMs(contentDraftsPath) : Promise.resolve(null),
  ]);

  const mtimes = [
    plainTextMtime,
    timestampedTextMtime,
    mindmapMtime,
    contentPointsMtime,
    contentDraftsMtime,
  ].filter((value) => typeof value === 'number');

  const timestamp = mtimes.length ? new Date(Math.max(...mtimes)) : new Date();
  const id = buildImportedRecordId(savedPath);

  return serializeRecord({
    id,
    taskId: id,
    title,
    status: 'completed',
    progress: 100,
    transcript,
    segments,
    wordCount: transcript.length,
    language: 'zh',
    savedPath,
    mindmapStatus: mindmapExists ? 'ready' : 'idle',
    mindmapPath: mindmapExists ? mindmapPath : undefined,
    mindmapUpdatedAt: mindmapMtime ? new Date(mindmapMtime) : undefined,
    pointExtractionStatus: contentPointsExists ? 'ready' : 'idle',
    pointExtractionUpdatedAt: contentPointsMtime ? new Date(contentPointsMtime) : undefined,
    contentGenerationStatus: contentDraftsExists ? 'ready' : 'idle',
    contentGenerationUpdatedAt: contentDraftsMtime ? new Date(contentDraftsMtime) : undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

async function importMissingTranscriptHistory(config) {
  // resolveConfigPath lives in exec.js; to avoid circular deps we inline the
  // bare path resolution here (config.outputDir is already an absolute path
  // after loadConfig() normalises it, so a simple resolve() is sufficient).
  const outputDir = config.outputDir ? path.resolve(String(config.outputDir)) : '';
  if (!outputDir) return 0;

  let entries;
  try {
    entries = await fsp.readdir(outputDir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return 0;
    }
    console.error('[MemoFlow Helper] failed to scan transcript output directory:', error);
    return 0;
  }

  return runWithHistoryMutation(async () => {
    const history = await loadHistory();
    const knownPaths = new Set(
      history.records
        .map((record) => normalizeSavedPath(record.savedPath))
        .filter(Boolean),
    );
    const importedRecords = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const directoryPath = path.join(outputDir, entry.name);
      const normalizedDirectoryPath = normalizeSavedPath(directoryPath);
      if (knownPaths.has(normalizedDirectoryPath)) {
        continue;
      }

      try {
        const importedRecord = await buildImportedRecordFromDirectory(directoryPath);
        if (!importedRecord) {
          continue;
        }

        importedRecords.push(importedRecord);
        knownPaths.add(normalizedDirectoryPath);
      } catch (error) {
        console.error(`[MemoFlow Helper] failed to import transcript history from ${directoryPath}:`, error);
      }
    }

    if (!importedRecords.length) {
      return 0;
    }

    history.records = [...importedRecords, ...history.records];
    history.lastUpdated = new Date().toISOString();
    await saveHistory(history);
    return importedRecords.length;
  });
}

module.exports = {
  toIsoDate,
  serializeRecord,
  normalizeSavedPath,
  buildImportedRecordId,
  isActiveTranscriptionStatus,
  loadHistory,
  saveHistory,
  runWithHistoryMutation,
  getLiveClientSet,
  emitRecord,
  closeLiveClients,
  createRecordUpdateEmitter,
  addRecord,
  getRecord,
  listRecords,
  removeRecord,
  reconcileInterruptedRecords,
  importMissingTranscriptHistory,
};
