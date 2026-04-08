const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { createHash, randomUUID } = require('crypto');
const { spawn, execSync, execFileSync } = require('child_process');

const APP_NAME = 'MemoFlow';
const HOST = process.env.MEMOFLOW_HELPER_HOST || '127.0.0.1';
const PORT = Number(process.env.MEMOFLOW_HELPER_PORT || 47392);

const MODEL_URLS = {
  small: 'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
  medium: 'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
};

const MODEL_SIZES = {
  small: 466000000,
  medium: 1530000000,
};

const ANSI_REGEX = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const SEGMENT_REGEX =
  /\[(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})\]\s*(.*)/;
const PROGRESS_REGEX = /progress\s*=\s*(\d+)%/i;
const FILETRANS_POLL_INTERVAL_MS = 2000;
const FILETRANS_TIMEOUT_MS = 20 * 60 * 1000;
const WHISPER_TIMEOUT_MS = 30 * 60 * 1000;
const SSE_HEARTBEAT_INTERVAL_MS = 10000;
const INSTALL_LOG_TAIL_LIMIT = 80;
const TRANSCRIPTION_PROGRESS_START = 25;
const TRANSCRIPTION_PROGRESS_END = 95;
const DEFAULT_QWEN_BASE_URL = 'https://dashscope.aliyuncs.com/api/v1';
const DEFAULT_QWEN_TEST_MODEL = 'qwen-plus';
const HOMEBREW_INSTALL_COMMAND =
  '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';

function getAppDataDir() {
  if (process.env.MEMOFLOW_HELPER_DATA_DIR) {
    return path.resolve(process.env.MEMOFLOW_HELPER_DATA_DIR);
  }
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', APP_NAME);
  }
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(home, 'AppData', 'Roaming'),
      APP_NAME,
    );
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), APP_NAME);
}

const APP_DIR = getAppDataDir();
const MODELS_DIR = path.join(APP_DIR, 'models');
const HISTORY_FILE = path.join(APP_DIR, 'transcription-history.json');
const CONFIG_FILE = path.join(APP_DIR, 'whisper-config.json');
const TEMP_DIR = path.join(os.tmpdir(), 'memo-flow-helper');
const PLAIN_TRANSCRIPT_FILE = '纯文本.txt';
const TIMESTAMPED_TRANSCRIPT_FILE = '逐字稿.txt';

let downloadProgress = {
  status: 'idle',
  downloaded: 0,
  total: 0,
  modelName: 'small',
};

let localRuntimeInstallProgress = {
  status: 'idle',
  currentStep: undefined,
  message: '等待安装',
  progress: 0,
  logsTail: [],
};

const modelDownloadClients = new Set();
const localRuntimeInstallClients = new Set();
const liveClients = new Map();
const activeTasks = new Map();
let historyMutationChain = Promise.resolve();
let serverInstance = null;
let startPromise = null;
let localRuntimeInstallPromise = null;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Private-Network': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function writeSse(res, data) {
  if (res.writableEnded || res.destroyed) {
    return false;
  }

  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

function openSse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Private-Network': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.write('retry: 3000\n');
  res.write(': connected\n\n');
  return setInterval(() => {
    if (res.writableEnded || res.destroyed) {
      return;
    }

    try {
      res.write(': heartbeat\n\n');
    } catch {}
  }, SSE_HEARTBEAT_INTERVAL_MS);
}

async function ensureAppDirs() {
  await fsp.mkdir(APP_DIR, { recursive: true });
  await fsp.mkdir(MODELS_DIR, { recursive: true });
  await fsp.mkdir(TEMP_DIR, { recursive: true });
}

function toIsoDate(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function serializeRecord(record) {
  return {
    ...record,
    createdAt: toIsoDate(record.createdAt),
    updatedAt: toIsoDate(record.updatedAt),
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
  const next = historyMutationChain.catch(() => {}).then(task);
  historyMutationChain = next.catch(() => {});
  return next;
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

  const [plainTextExists, timestampedTextExists] = await Promise.all([
    fsp.access(plainTextPath).then(() => true).catch(() => false),
    fsp.access(timestampedTextPath).then(() => true).catch(() => false),
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

  const mtimes = (
    await Promise.all([
      plainTextExists ? getFileMtimeMs(plainTextPath) : Promise.resolve(null),
      timestampedTextExists ? getFileMtimeMs(timestampedTextPath) : Promise.resolve(null),
    ])
  ).filter((value) => typeof value === 'number');

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
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

async function importMissingTranscriptHistory(config) {
  const outputDir = normalizeSavedPath(resolveConfigPath(config.outputDir));
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

function getDefaultModelName() {
  return 'small';
}

function getDefaultWhisperPath() {
  return process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
}

function getDefaultFfmpegPath() {
  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
}

function isDefaultBinaryConfigPath(kind, inputPath) {
  if (!inputPath) return true;
  const expected = kind === 'whisper' ? getDefaultWhisperPath() : getDefaultFfmpegPath();
  return String(inputPath).trim() === expected;
}

function getDefaultOutputDir() {
  return path.join(os.homedir(), 'Documents', 'MemoFlow Transcripts');
}

function getDefaultModelPath(modelName = getDefaultModelName()) {
  return path.join(MODELS_DIR, `ggml-${modelName}.bin`);
}

function getWhisperThreadLimit() {
  const cpuCount = os.cpus()?.length || 4;
  return Math.max(1, Math.min(8, cpuCount));
}

function normalizeWhisperThreads(input) {
  const parsed = Number.parseInt(String(input || 0), 10);
  const safeValue = Number.isNaN(parsed) ? Math.max(1, Math.floor(getWhisperThreadLimit() / 2)) : parsed;
  return Math.max(1, Math.min(getWhisperThreadLimit(), safeValue));
}

function normalizeConfig(config) {
  const next = {
    ...config,
  };

  next.modelName = next.modelName || getDefaultModelName();
  next.modelPath = next.modelPath || getDefaultModelPath(next.modelName);
  next.threads = normalizeWhisperThreads(next.threads);

  return next;
}

function getDefaultConfig() {
  return normalizeConfig({
    whisperPath: getDefaultWhisperPath(),
    modelPath: getDefaultModelPath(),
    modelName: getDefaultModelName(),
    threads: Math.max(1, Math.floor(getWhisperThreadLimit() / 2)),
    outputDir: getDefaultOutputDir(),
    ffmpegPath: getDefaultFfmpegPath(),
  });
}

async function loadConfig() {
  await ensureAppDirs();
  const defaults = getDefaultConfig();

  try {
    const raw = await fsp.readFile(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const next = normalizeConfig({
      ...defaults,
      ...parsed,
    });
    return next;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      await saveConfig(defaults);
      return defaults;
    }
    throw error;
  }
}

async function saveConfig(config) {
  await ensureAppDirs();
  const normalized = normalizeConfig(config);
  await fsp.writeFile(CONFIG_FILE, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

function normalizeLineBreaks(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function stripAnsi(text) {
  return text.replace(ANSI_REGEX, '');
}

function buildTranscriptFromSegments(segments) {
  return segments
    .map((segment) => String(segment.text || '').trim())
    .filter(Boolean)
    .join('\n');
}

function toWhisperTimestamp(timestamp) {
  const normalized = timestamp.replace(',', '.');
  return normalized.includes('.') ? normalized : `${normalized}.000`;
}

function parseTimestampToSeconds(timestamp) {
  const match = String(timestamp || '').match(/(\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?/);
  if (!match) return null;

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseInt(match[3], 10);
  const millis = Number.parseInt((match[4] || '0').padEnd(3, '0'), 10);

  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

function getSegmentEndSeconds(segmentTimestamp) {
  const parts = String(segmentTimestamp || '')
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split('-->')
    .map((part) => part.trim());

  if (parts.length !== 2) return null;
  return parseTimestampToSeconds(parts[1]);
}

function clampProgress(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function mapTranscriptionRatioToProgress(ratio) {
  const safeRatio = Math.max(0, Math.min(1, ratio));
  return clampProgress(
    TRANSCRIPTION_PROGRESS_START +
      (TRANSCRIPTION_PROGRESS_END - TRANSCRIPTION_PROGRESS_START) * safeRatio,
  );
}

function getProgressFromSegment(segmentTimestamp, durationSeconds) {
  if (!durationSeconds || durationSeconds <= 0) return null;
  const endSeconds = getSegmentEndSeconds(segmentTimestamp);
  if (endSeconds == null) return null;
  return mapTranscriptionRatioToProgress(endSeconds / durationSeconds);
}

function getProgressFromWhisperPercent(percent) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  return mapTranscriptionRatioToProgress(safePercent / 100);
}

function getEstimatedTranscriptionProgress(elapsedMs, durationSeconds) {
  if (!durationSeconds || durationSeconds <= 0) return null;
  const expectedMs = Math.max(durationSeconds * 1500, 60000);
  const ratio = Math.min(elapsedMs / expectedMs, 1);
  const estimated = TRANSCRIPTION_PROGRESS_START + ratio * 45;
  return clampProgress(Math.min(estimated, 70));
}

function parseSrtSegments(srtContent) {
  const blocks = normalizeLineBreaks(srtContent)
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const segments = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) continue;

    const timestampLineIndex = lines.findIndex((line) => line.includes('-->'));
    if (timestampLineIndex === -1) continue;

    const timestampLine = lines[timestampLineIndex];
    const textLines = lines.slice(timestampLineIndex + 1);
    if (!textLines.length) continue;

    const [startRaw, endRaw] = timestampLine.split('-->').map((part) => part.trim());
    if (!startRaw || !endRaw) continue;

    segments.push({
      timestamp: `[${toWhisperTimestamp(startRaw)} --> ${toWhisperTimestamp(endRaw)}]`,
      text: textLines.join(' ').trim(),
    });
  }

  return segments;
}

function createWhisperOutputParser({ onProgress, onSegment }) {
  let buffer = '';
  let lastSegmentKey = '';
  let lastProgress = -1;

  function handleLine(rawLine) {
    const line = stripAnsi(rawLine).trim();
    if (!line) return;

    const segmentMatch = line.match(SEGMENT_REGEX);
    if (segmentMatch) {
      const segment = {
        timestamp: `[${segmentMatch[1]} --> ${segmentMatch[2]}]`,
        text: segmentMatch[3].trim(),
      };
      const key = `${segment.timestamp}|${segment.text}`;
      if (!segment.text || key === lastSegmentKey) return;
      lastSegmentKey = key;
      onSegment(segment);
      return;
    }

    const progressMatch = line.match(PROGRESS_REGEX);
    if (!progressMatch) return;
    const progress = Number.parseInt(progressMatch[1], 10);
    if (Number.isNaN(progress) || progress === lastProgress) return;
    lastProgress = progress;
    onProgress(progress);
  }

  return {
    push(text) {
      buffer += normalizeLineBreaks(text);
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        handleLine(line);
      }
    },
    flush() {
      const trailing = buffer.trim();
      buffer = '';
      if (trailing) {
        handleLine(trailing);
      }
    },
  };
}

function sanitizeDirName(name) {
  return (
    String(name || '')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200) || '未知标题'
  );
}

function timestampToMMSS(ts) {
  const match = ts.match(/(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return '00:00';
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseInt(match[3], 10);
  return `${String(hours * 60 + minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function writeTranscriptTextFiles(episodeDir, segments, transcript, meta = {}) {
  await fsp.mkdir(episodeDir, { recursive: true });

  const timestampedLines = segments.map((segment) => {
    const startTs = segment.timestamp.match(/\[(\d{2}:\d{2}:\d{2}\.\d{3})/);
    const mmss = startTs ? timestampToMMSS(startTs[1]) : '00:00';
    return `${mmss}\t${segment.text}`;
  });

  await fsp.writeFile(path.join(episodeDir, '逐字稿.txt'), timestampedLines.join('\n'), 'utf8');
  await fsp.writeFile(path.join(episodeDir, '纯文本.txt'), transcript, 'utf8');

  if (meta.sourceUrl || meta.title) {
    const intro = [
      meta.title ? `# ${meta.title}` : '',
      meta.author ? `作者: ${meta.author}` : '',
      meta.sourceUrl ? `原始链接: ${meta.sourceUrl}` : '',
      meta.pubDate ? `发布日期: ${meta.pubDate}` : '',
      meta.description ? '' : '',
      meta.description || '',
    ]
      .filter(Boolean)
      .join('\n');
    await fsp.writeFile(path.join(episodeDir, '简介.md'), intro, 'utf8');
  }

  return episodeDir;
}

function isBareCommandPath(inputPath) {
  return (
    Boolean(inputPath) &&
    !path.isAbsolute(inputPath) &&
    !inputPath.includes('/') &&
    !inputPath.includes('\\') &&
    !inputPath.startsWith('.')
  );
}

function resolveCommandPath(commandName) {
  try {
    const cmd =
      process.platform === 'win32'
        ? `where ${commandName}`
        : `command -v "${commandName.replaceAll('"', '\\"')}"`;
    const output = execSync(cmd, {
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: process.platform === 'win32' ? true : '/bin/bash',
      env: buildBaseEnv(),
    })
      .toString()
      .trim()
      .split(/\r?\n/)[0];
    return output || null;
  } catch {
    return null;
  }
}

function resolveConfigPath(inputPath) {
  if (!inputPath) return inputPath;
  if (path.isAbsolute(inputPath)) return path.normalize(inputPath);
  if (isBareCommandPath(inputPath)) {
    return resolveCommandPath(inputPath) || inputPath;
  }
  return path.resolve(process.cwd(), inputPath);
}

function buildBaseEnv() {
  if (process.platform === 'win32') {
    return { ...process.env };
  }
  const extraPaths = ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin'];
  const fullPath = extraPaths.concat(String(process.env.PATH || '').split(':')).filter(Boolean);
  return {
    ...process.env,
    PATH: Array.from(new Set(fullPath)).join(':'),
  };
}

function buildExecOptions(binaryPath) {
  const env = buildBaseEnv();
  const resolvedPath = resolveConfigPath(binaryPath);

  if (process.platform === 'win32' || !resolvedPath || !path.isAbsolute(resolvedPath)) {
    return { env };
  }

  const buildDir = path.resolve(path.dirname(resolvedPath), '..');
  const dylibDirs = [
    path.join(buildDir, 'src'),
    path.join(buildDir, 'ggml', 'src'),
    path.join(buildDir, 'ggml', 'src', 'ggml-blas'),
    path.join(buildDir, 'ggml', 'src', 'ggml-metal'),
  ].filter((dir) => fs.existsSync(dir));

  if (dylibDirs.length) {
    const joined = dylibDirs.join(':');
    env.DYLD_LIBRARY_PATH = env.DYLD_LIBRARY_PATH
      ? `${joined}:${env.DYLD_LIBRARY_PATH}`
      : joined;
    env.DYLD_FALLBACK_LIBRARY_PATH = env.DYLD_FALLBACK_LIBRARY_PATH
      ? `${joined}:${env.DYLD_FALLBACK_LIBRARY_PATH}`
      : joined;
    env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH
      ? `${joined}:${env.LD_LIBRARY_PATH}`
      : joined;
  }

  return { env };
}

function resolveExecutablePath(inputPath) {
  if (!inputPath) return null;
  return resolveConfigPath(inputPath);
}

function hasExecutableFilePermissions(resolvedPath) {
  if (!resolvedPath || !fs.existsSync(resolvedPath)) return false;

  try {
    const stats = fs.statSync(resolvedPath);
    if (!stats.isFile()) return false;
    if (process.platform !== 'win32' && !(stats.mode & 0o111)) return false;
    return true;
  } catch {
    return false;
  }
}

function canRunExecutable(inputPath, args) {
  if (!inputPath) return false;

  const resolvedPath = resolveExecutablePath(inputPath);
  if (!resolvedPath) return false;

  try {
    if (isBareCommandPath(inputPath)) {
      execFileSync(resolvedPath, args, {
        timeout: 10000,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: buildBaseEnv(),
      });
      return true;
    }

    if (!hasExecutableFilePermissions(resolvedPath)) {
      return false;
    }

    execFileSync(resolvedPath, args, {
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...buildExecOptions(inputPath),
    });
    return true;
  } catch {
    return false;
  }
}

function isValidHomebrewExecutable(inputPath) {
  return canRunExecutable(inputPath, ['--version']);
}

function findWorkingExecutable(candidates, args) {
  const seen = new Set();

  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = String(candidate).trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    if (!canRunExecutable(normalized, args)) {
      continue;
    }

    return resolveExecutablePath(normalized) || normalized;
  }

  return null;
}

function detectHomebrewPath() {
  if (process.platform !== 'darwin') {
    return null;
  }

  return findWorkingExecutable(
    ['/opt/homebrew/bin/brew', '/usr/local/bin/brew', 'brew'],
    ['--version'],
  );
}

function getBrewFormulaExecutableCandidates(homebrewPath, formulaName, executableNames) {
  if (!homebrewPath) {
    return [];
  }

  try {
    const prefix = execFileSync(homebrewPath, ['--prefix', formulaName], {
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: buildBaseEnv(),
    })
      .toString()
      .trim();

    if (!prefix) {
      return [];
    }

    return executableNames.map((name) => path.join(prefix, 'bin', name));
  } catch {
    return [];
  }
}

function getDetectedWhisperCandidates(homebrewPath) {
  return [
    'whisper-cli',
    '/opt/homebrew/bin/whisper-cli',
    '/usr/local/bin/whisper-cli',
    'whisper-cpp',
    '/opt/homebrew/bin/whisper-cpp',
    '/usr/local/bin/whisper-cpp',
    ...getBrewFormulaExecutableCandidates(homebrewPath, 'whisper-cpp', [
      'whisper-cli',
      'whisper-cpp',
      'main',
    ]),
  ];
}

function getDetectedFfmpegCandidates(homebrewPath) {
  return [
    'ffmpeg',
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    ...getBrewFormulaExecutableCandidates(homebrewPath, 'ffmpeg', ['ffmpeg']),
  ];
}

function resolveRuntimeExecutable(kind, configuredPath, homebrewPath, isManagedPath = false) {
  const args = kind === 'whisper' ? ['-h'] : ['-version'];
  const configuredPathRaw = String(configuredPath || '').trim();
  const configuredIsUserDefined =
    Boolean(configuredPathRaw) &&
    !isDefaultBinaryConfigPath(kind, configuredPathRaw) &&
    !isManagedPath;

  if (configuredIsUserDefined && canRunExecutable(configuredPathRaw, args)) {
    return {
      configuredPath: configuredPathRaw,
      effectivePath: resolveExecutablePath(configuredPathRaw) || configuredPathRaw,
      source: 'configured',
      installed: true,
    };
  }

  const detectedCandidates =
    kind === 'whisper'
      ? getDetectedWhisperCandidates(homebrewPath)
      : getDetectedFfmpegCandidates(homebrewPath);
  const detectedPath = findWorkingExecutable(detectedCandidates, args);

  if (detectedPath) {
    return {
      configuredPath: configuredPathRaw,
      effectivePath: detectedPath,
      source: 'detected',
      installed: true,
    };
  }

  return {
    configuredPath: configuredPathRaw,
    effectivePath: undefined,
    source: 'missing',
    installed: false,
  };
}

function isValidWhisperExecutable(inputPath) {
  return canRunExecutable(inputPath, ['-h']);
}

function isValidFfmpegExecutable(inputPath) {
  return canRunExecutable(inputPath, ['-version']);
}

function inferModelName(modelPath) {
  if (!modelPath) return getDefaultModelName();
  const normalized = modelPath.toLowerCase();
  if (normalized.includes('medium')) return 'medium';
  return 'small';
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function buildWhisperStatus(config) {
  const resolvedModelPath = resolveConfigPath(config.modelPath);
  const modelInstalled = Boolean(resolvedModelPath && fs.existsSync(resolvedModelPath));
  const homebrewPath = detectHomebrewPath();
  const homebrewInstalled = Boolean(homebrewPath);
  const whisperRuntime = resolveRuntimeExecutable(
    'whisper',
    config.whisperPath,
    homebrewPath,
    Boolean(config.whisperPathManaged),
  );
  const ffmpegRuntime = resolveRuntimeExecutable(
    'ffmpeg',
    config.ffmpegPath,
    homebrewPath,
    Boolean(config.ffmpegPathManaged),
  );
  let modelSize = '0 B';
  if (modelInstalled) {
    modelSize = formatFileSize(fs.statSync(resolvedModelPath).size);
  }

  const missingRequirements = [];
  if (!whisperRuntime.installed) {
    if (!homebrewInstalled && process.platform === 'darwin') {
      missingRequirements.push('homebrew');
    }
    missingRequirements.push('whisper');
  }
  if (!ffmpegRuntime.installed) {
    if (!homebrewInstalled && process.platform === 'darwin') {
      missingRequirements.push('homebrew');
    }
    missingRequirements.push('ffmpeg');
  }
  if (!modelInstalled) {
    missingRequirements.push('model');
  }

  return {
    helperConnected: true,
    homebrewInstalled,
    whisperInstalled: whisperRuntime.installed,
    modelInstalled,
    ffmpegInstalled: ffmpegRuntime.installed,
    autoInstallSupported: process.platform === 'darwin',
    homebrewPath: homebrewPath || '',
    configuredWhisperPath: config.whisperPath || '',
    configuredFfmpegPath: config.ffmpegPath || '',
    effectiveWhisperPath: whisperRuntime.effectivePath || '',
    effectiveFfmpegPath: ffmpegRuntime.effectivePath || '',
    whisperSource: whisperRuntime.source,
    ffmpegSource: ffmpegRuntime.source,
    missingRequirements: Array.from(new Set(missingRequirements)),
    whisperPath: config.whisperPath,
    modelPath: config.modelPath,
    modelName: config.modelName || inferModelName(config.modelPath),
    modelSize,
    ffmpegPath: config.ffmpegPath,
    platform: process.platform,
    installMode: 'mixed',
  };
}

async function syncDetectedRuntimeIntoConfig() {
  const config = await loadConfig();
  const status = buildWhisperStatus(config);
  let changed = false;

  if (
    (!String(config.whisperPath || '').trim() || !isValidWhisperExecutable(config.whisperPath)) &&
    status.effectiveWhisperPath
  ) {
    config.whisperPath = status.effectiveWhisperPath;
    config.whisperPathManaged = true;
    changed = true;
  }

  if (
    (!String(config.ffmpegPath || '').trim() || !isValidFfmpegExecutable(config.ffmpegPath)) &&
    status.effectiveFfmpegPath
  ) {
    config.ffmpegPath = status.effectiveFfmpegPath;
    config.ffmpegPathManaged = true;
    changed = true;
  }

  if (changed) {
    await saveConfig(config);
  }

  return buildWhisperStatus(await loadConfig());
}

function normalizeInstallComponents(components) {
  const allowed = new Set(['homebrew', 'whisper', 'ffmpeg']);
  const next = [];

  for (const component of Array.isArray(components) ? components : []) {
    if (!allowed.has(component) || next.includes(component)) {
      continue;
    }
    next.push(component);
  }

  return next;
}

async function runLoggedCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: buildBaseEnv(),
      ...options,
    });

    let stderr = '';
    let stdout = '';

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      appendLocalRuntimeInstallLogs(text);
    });

    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      appendLocalRuntimeInstallLogs(text);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const details = stripAnsi(stderr || stdout).trim();
      reject(
        new Error(
          details ? `命令执行失败 (${code})\n${details}` : `命令执行失败，退出码 ${code}`,
        ),
      );
    });
  });
}

async function ensureHomebrewInstalled() {
  const existingPath = detectHomebrewPath();
  if (existingPath) {
    appendLocalRuntimeInstallLogs(`已检测到 Homebrew: ${existingPath}`);
    return existingPath;
  }

  updateLocalRuntimeInstallProgress({
    status: 'running',
    currentStep: 'installing_homebrew',
    message: '正在安装 Homebrew...',
    progress: 10,
  });

  await runLoggedCommand(
    '/bin/bash',
    ['-lc', HOMEBREW_INSTALL_COMMAND],
    {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: {
        ...buildBaseEnv(),
      },
    },
  );

  const installedPath = detectHomebrewPath();
  if (!installedPath) {
    throw new Error('Homebrew 安装完成后仍未检测到 brew');
  }

  appendLocalRuntimeInstallLogs(`Homebrew 安装完成: ${installedPath}`);
  return installedPath;
}

async function ensureFormulaInstalled(component, homebrewPath) {
  const mapping = {
    whisper: {
      formula: 'whisper-cpp',
      step: 'installing_whisper',
      message: '正在安装 whisper.cpp...',
      progress: 55,
      validate: () => resolveRuntimeExecutable('whisper', '', detectHomebrewPath()),
    },
    ffmpeg: {
      formula: 'ffmpeg',
      step: 'installing_ffmpeg',
      message: '正在安装 ffmpeg...',
      progress: 85,
      validate: () => resolveRuntimeExecutable('ffmpeg', '', detectHomebrewPath()),
    },
  };

  const current = mapping[component];
  if (!current) {
    throw new Error(`不支持的安装组件: ${component}`);
  }

  const runtime = current.validate();
  if (runtime.installed) {
    appendLocalRuntimeInstallLogs(`${current.formula} 已可用，跳过安装`);
    return;
  }

  updateLocalRuntimeInstallProgress({
    status: 'running',
    currentStep: current.step,
    message: current.message,
    progress: current.progress,
  });

  await runLoggedCommand(homebrewPath, ['install', current.formula], {
    env: {
      ...buildBaseEnv(),
      HOMEBREW_NO_AUTO_UPDATE: '1',
      CI: '1',
    },
  });

  const nextRuntime = current.validate();
  if (!nextRuntime.installed) {
    throw new Error(`${current.formula} 安装完成后仍未检测到可执行文件`);
  }

  appendLocalRuntimeInstallLogs(`${current.formula} 安装完成`);
}

async function installLocalRuntime(requestedComponents) {
  if (process.platform !== 'darwin') {
    throw new Error('一键安装当前仅支持 macOS');
  }

  const requested = normalizeInstallComponents(requestedComponents);
  if (!requested.length) {
    throw new Error('未指定要安装的组件');
  }

  updateLocalRuntimeInstallProgress({
    status: 'running',
    currentStep: undefined,
    message: '准备检查本地环境...',
    progress: 0,
    logsTail: [],
  });

  const shouldInstallBinaries = requested.includes('whisper') || requested.includes('ffmpeg');
  let homebrewPath = detectHomebrewPath();

  if (requested.includes('homebrew') || (shouldInstallBinaries && !homebrewPath)) {
    homebrewPath = await ensureHomebrewInstalled();
  }

  if (!homebrewPath && shouldInstallBinaries) {
    throw new Error('未检测到 Homebrew，无法继续安装 whisper.cpp / ffmpeg');
  }

  if (requested.includes('whisper')) {
    await ensureFormulaInstalled('whisper', homebrewPath);
  }

  if (requested.includes('ffmpeg')) {
    await ensureFormulaInstalled('ffmpeg', homebrewPath);
  }

  const status = await syncDetectedRuntimeIntoConfig();
  updateLocalRuntimeInstallProgress({
    status: 'succeeded',
    currentStep: undefined,
    message: '本地依赖安装完成',
    progress: 100,
  });
  return status;
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

function getLiveClientSet(taskId) {
  if (!liveClients.has(taskId)) {
    liveClients.set(taskId, new Set());
  }
  return liveClients.get(taskId);
}

function emitRecord(taskId, record) {
  const clients = liveClients.get(taskId);
  if (!clients) return;
  for (const res of clients) {
    if (!writeSse(res, { success: true, data: record })) {
      clients.delete(res);
    }
  }
}

function closeLiveClients(taskId) {
  const clients = liveClients.get(taskId);
  if (!clients) return;
  for (const res of clients) {
    try {
      res.end();
    } catch {}
  }
  liveClients.delete(taskId);
}

function emitDownloadProgress() {
  for (const res of modelDownloadClients) {
    if (!writeSse(res, downloadProgress)) {
      modelDownloadClients.delete(res);
    }
  }
}

function emitLocalRuntimeInstallProgress() {
  for (const res of localRuntimeInstallClients) {
    if (!writeSse(res, localRuntimeInstallProgress)) {
      localRuntimeInstallClients.delete(res);
    }
  }
}

function updateLocalRuntimeInstallProgress(patch) {
  localRuntimeInstallProgress = {
    ...localRuntimeInstallProgress,
    ...patch,
  };
  emitLocalRuntimeInstallProgress();
}

function appendLocalRuntimeInstallLogs(text) {
  const lines = normalizeLineBreaks(String(text || ''))
    .split('\n')
    .map((line) => stripAnsi(line).trimEnd())
    .filter(Boolean);

  if (!lines.length) {
    return;
  }

  localRuntimeInstallProgress = {
    ...localRuntimeInstallProgress,
    logsTail: [...localRuntimeInstallProgress.logsTail, ...lines].slice(-INSTALL_LOG_TAIL_LIMIT),
  };
  emitLocalRuntimeInstallProgress();
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

function createTaskContext(taskId) {
  const controller = new AbortController();
  const context = {
    id: taskId,
    controller,
    cancelled: false,
    children: new Set(),
    tempFiles: new Set(),
  };
  activeTasks.set(taskId, context);
  return context;
}

function getTaskContext(taskId) {
  return activeTasks.get(taskId) || null;
}

function throwIfCancelled(context) {
  if (context?.cancelled || context?.controller.signal.aborted) {
    const error = new Error('任务已取消');
    error.code = 'TASK_CANCELLED';
    throw error;
  }
}

async function cancelTask(taskId) {
  const context = getTaskContext(taskId);
  if (!context) return false;
  context.cancelled = true;
  context.controller.abort();
  for (const child of context.children) {
    try {
      child.kill();
    } catch {}
  }
  activeTasks.delete(taskId);
  return true;
}

async function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    await fsp.unlink(filePath);
  } catch {}
}

async function cleanupTaskContext(context) {
  if (!context) return;
  for (const filePath of context.tempFiles) {
    await safeUnlink(filePath);
  }
  activeTasks.delete(context.id);
}

function extractEpisodeId(url) {
  const match = String(url || '').match(/episode\/([a-f0-9]+)/i);
  return match ? match[1] : '';
}

function createTimeoutSignal(timeoutMs, signal) {
  if (!signal) return AbortSignal.timeout(timeoutMs);
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
  }
  return signal;
}

async function fetchFromOfficialApi(episodeId, signal) {
  try {
    const response = await fetch('https://api.xiaoyuzhoufm.com/v1/episode/get', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'okhttp/4.7.2',
        applicationid: 'app.podcast.cosmos',
        'app-version': '1.6.0',
      },
      body: JSON.stringify({ eid: episodeId }),
      signal: createTimeoutSignal(10000, signal),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const audioUrl = data?.data?.enclosure?.url || data?.enclosure?.url || data?.mediaUrl || '';
    if (!audioUrl) return null;

    return {
      title: data?.data?.title || data?.title || '未知标题',
      description: data?.data?.description || data?.data?.shownotes || data?.description || '',
      audioUrl,
      duration: data?.data?.duration ? Math.floor(data.data.duration) : undefined,
      pubDate: data?.data?.pubDate || new Date().toISOString(),
      author: data?.data?.podcast?.author || data?.author || '未知作者',
      thumbnail: data?.data?.image?.picUrl || data?.data?.podcast?.image?.picUrl || '',
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}

async function fetchFromPageHtml(episodeId, signal) {
  try {
    const response = await fetch(`https://www.xiaoyuzhoufm.com/episode/${episodeId}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: createTimeoutSignal(15000, signal),
    });
    if (!response.ok) return null;
    const html = await response.text();

    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        const episode =
          nextData?.props?.pageProps?.episode ||
          nextData?.props?.pageProps?.data?.episode ||
          nextData?.props?.pageProps;
        const audioUrl = episode?.enclosure?.url || episode?.mediaUrl || episode?.audioUrl || '';
        if (audioUrl) {
          return {
            title: episode.title || '未知标题',
            description: episode.description || episode.shownotes || '',
            audioUrl,
            duration: episode.duration ? Math.floor(episode.duration) : undefined,
            pubDate: episode.pubDate || new Date().toISOString(),
            author: episode?.podcast?.author || '未知作者',
            thumbnail: episode?.image?.picUrl || episode?.podcast?.image?.picUrl || '',
          };
        }
      } catch {}
    }

    const ogAudioMatch = html.match(/<meta\s+property="og:audio"\s+content="([^"]+)"/);
    if (ogAudioMatch) {
      const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/);
      return {
        title: titleMatch?.[1] || '未知标题',
        description: '',
        audioUrl: ogAudioMatch[1],
        author: '未知作者',
      };
    }

    const audioLinkMatch = html.match(/https?:\/\/[^\s"'<>]*?\.(?:m4a|mp3)(?:\?[^\s"'<>]*)?/);
    if (audioLinkMatch) {
      return {
        title: '未知标题',
        description: '',
        audioUrl: audioLinkMatch[0],
        author: '未知作者',
      };
    }
    return null;
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}

async function fetchFromThirdPartyApi(episodeId, signal) {
  try {
    const response = await fetch(`https://music.moon.fm/api/v1/episodes/${episodeId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      signal: createTimeoutSignal(10000, signal),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const audioUrl = data.audioUrl || data.playback_url || data.enclosure_url || '';
    if (!audioUrl) return null;
    return {
      title: data.title || '未知标题',
      description: data.description || data.shownotes || '',
      audioUrl,
      duration: data.duration ? Math.floor(data.duration / 1000) : undefined,
      pubDate: data.pubDate || data.publishedAt || new Date().toISOString(),
      author: data.podcast?.author || data.author || '未知作者',
      thumbnail: data.podcast?.coverImage?.urlPattern || data.coverImageUrl || '',
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}

async function fetchEpisodeInfo(url, signal) {
  const episodeId = extractEpisodeId(url);
  if (!episodeId) {
    throw new Error('无效的小宇宙链接格式，请确认链接包含 /episode/ 路径');
  }

  const fromApi = await fetchFromOfficialApi(episodeId, signal);
  if (fromApi) return fromApi;
  const fromPage = await fetchFromPageHtml(episodeId, signal);
  if (fromPage) return fromPage;
  const fromThird = await fetchFromThirdPartyApi(episodeId, signal);
  if (fromThird) return fromThird;

  throw new Error('无法获取播客音频链接，请检查链接是否正确或稍后重试');
}

function formatDashScopeTimestamp(ms) {
  const totalMs = Math.max(0, Number(ms) || 0);
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(
    seconds,
  ).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function buildSegmentsFromTranscript(transcript) {
  return String(transcript || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text, index) => ({
      timestamp: `[00:00:${String(index).padStart(2, '0')}.000 --> 00:00:${String(
        index + 1,
      ).padStart(2, '0')}.000]`,
      text,
    }));
}

function extractTranscriptItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.transcripts)) return payload.transcripts;
    if (Array.isArray(payload.output?.results)) return payload.output.results;
  }
  return [];
}

function buildResultFromFileTransPayload(payload) {
  const items = extractTranscriptItems(payload);
  const segments = [];
  const transcriptParts = [];

  for (const item of items) {
    const itemText = String(item.text || '').trim();
    if (itemText) transcriptParts.push(itemText);

    if (Array.isArray(item.sentences)) {
      for (const sentence of item.sentences) {
        const text = String(sentence.text || '').trim();
        if (!text) continue;
        const startRaw = sentence.begin_time ?? sentence.sentence_begin_time ?? 0;
        const endRaw = sentence.end_time ?? sentence.sentence_end_time ?? startRaw;
        segments.push({
          timestamp: `[${formatDashScopeTimestamp(startRaw)} --> ${formatDashScopeTimestamp(
            endRaw,
          )}]`,
          text,
        });
      }
    }
  }

  const transcript = transcriptParts.join('\n').trim();
  return {
    transcript,
    segments: segments.length ? segments : buildSegmentsFromTranscript(transcript),
  };
}

async function sleep(ms, signal) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('任务已取消'));
      },
      { once: true },
    );
  });
}

async function transcribeWithQwenFileTrans(audioUrl, config, onUpdate, signal) {
  if (!config?.apiKey) {
    throw new Error('千问 ASR API Key 未配置，请在设置中填写');
  }

  const baseUrl = String(config.baseUrl || 'https://dashscope.aliyuncs.com/api/v1').replace(
    /\/$/,
    '',
  );
  const submitResponse = await fetch(`${baseUrl}/services/audio/asr/transcription`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: 'qwen3-asr-flash-filetrans',
      input: {
        file_url: audioUrl,
      },
      parameters: {
        channel_id: [0],
        enable_itn: config.enableITN ?? true,
        enable_words: true,
      },
    }),
    signal,
  });

  if (!submitResponse.ok) {
    throw new Error(`千问 ASR 提交失败 (${submitResponse.status})`);
  }

  const submitPayload = await submitResponse.json();
  const taskId = submitPayload?.output?.task_id;
  if (!taskId) {
    throw new Error(submitPayload?.message || '千问 ASR 任务提交失败');
  }

  onUpdate({ progress: 15, transcript: '' });

  const startedAt = Date.now();
  let queryProgress = 20;

  while (true) {
    if (signal?.aborted) {
      throw new Error('任务已取消');
    }

    if (Date.now() - startedAt > FILETRANS_TIMEOUT_MS) {
      throw new Error('千问 ASR 长音频转录超时，请稍后重试');
    }

    await sleep(FILETRANS_POLL_INTERVAL_MS, signal);

    const queryResponse = await fetch(`${baseUrl}/tasks/${taskId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      signal,
    });

    if (!queryResponse.ok) {
      throw new Error(`千问 ASR 查询失败 (${queryResponse.status})`);
    }

    const queryPayload = await queryResponse.json();
    const status = String(queryPayload?.output?.task_status || '').toUpperCase();
    const code = queryPayload?.output?.code || queryPayload?.code;
    const message = queryPayload?.output?.message || queryPayload?.message;

    if (code) {
      throw new Error(`千问 ASR 错误 [${code}]: ${message || '未知错误'}`);
    }
    if (status === 'FAILED' || status === 'CANCELED') {
      throw new Error(message || '千问 ASR 长音频转录失败');
    }
    if (status === 'SUCCEEDED') {
      onUpdate({ progress: 90 });
      const transcriptionUrl = queryPayload?.output?.result?.transcription_url;
      if (!transcriptionUrl) {
        throw new Error('千问 ASR 转录完成，但未返回 transcription_url');
      }
      const resultResponse = await fetch(transcriptionUrl, { signal });
      if (!resultResponse.ok) {
        throw new Error(`下载千问 ASR 转录结果失败 (${resultResponse.status})`);
      }
      const resultPayload = await resultResponse.json();
      const result = buildResultFromFileTransPayload(resultPayload);
      onUpdate({ progress: 100, transcript: result.transcript });
      return result;
    }

    queryProgress = Math.min(queryProgress + 8, 80);
    onUpdate({ progress: queryProgress });
  }
}

async function testQwenASRConnection(config) {
  if (!config?.apiKey) {
    return { success: false, message: 'API Key 不能为空' };
  }

  try {
    const baseUrl = String(config.baseUrl || DEFAULT_QWEN_BASE_URL).replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/services/aigc/multimodal-generation/generation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_QWEN_TEST_MODEL,
        input: {
          messages: [
            {
              role: 'system',
              content: [{ text: '' }],
            },
            {
              role: 'user',
              content: [{ text: 'test' }],
            },
          ],
        },
      }),
    });

    if (response.status === 401 || response.status === 403) {
      return { success: false, message: 'API Key 无效，或与当前 DashScope 地域端点不匹配' };
    }

    if (response.status === 400) {
      const body = await response.json();
      if (
        body.code &&
        !String(body.code).includes('Unauthorized') &&
        !String(body.code).includes('InvalidApiKey')
      ) {
        return { success: true, message: 'API Key 验证通过，连接正常' };
      }

      return {
        success: false,
        message: body.message || 'API Key 验证失败',
      };
    }

    if (response.ok) {
      return { success: true, message: 'API Key 验证通过，连接正常' };
    }

    return {
      success: false,
      message: `连接失败 (HTTP ${response.status})`,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { success: false, message: '连接超时' };
      }
      return { success: false, message: `连接失败: ${error.message}` };
    }

    return { success: false, message: '未知连接错误' };
  }
}

async function downloadFile(sourceUrl, targetPath, signal) {
  const response = await fetch(sourceUrl, { signal });
  if (!response.ok) {
    throw new Error(`下载音频失败 (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fsp.writeFile(targetPath, buffer);
}

async function convertToWav(inputPath, ffmpegPath, context) {
  const wavPath = inputPath.replace(path.extname(inputPath), '.wav');
  context.tempFiles.add(wavPath);

  await new Promise((resolve, reject) => {
    const child = spawn(
      resolveConfigPath(ffmpegPath) || ffmpegPath,
      ['-i', inputPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-y', wavPath],
      buildExecOptions(ffmpegPath),
    );

    context.children.add(child);
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 2000) stderr = stderr.slice(-2000);
    });

    child.on('close', (code, signal) => {
      context.children.delete(child);
      if (context.cancelled) {
        reject(new Error('任务已取消'));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      const reason = code !== null ? `退出码: ${code}` : `信号: ${signal}`;
      reject(new Error(`ffmpeg 转换失败，${reason}\n${stderr.trim()}`));
    });

    child.on('error', (error) => {
      context.children.delete(child);
      reject(error);
    });
  });

  return wavPath;
}

async function runWhisperStreaming(
  wavPath,
  config,
  whisperExecutablePath,
  context,
  onSegment,
  onProgress,
) {
  const srtPath = `${wavPath}.srt`;
  context.tempFiles.add(srtPath);
  const parser = createWhisperOutputParser({ onSegment, onProgress });
  const threads = normalizeWhisperThreads(config.threads);

  await new Promise((resolve, reject) => {
    const child = spawn(
      resolveConfigPath(whisperExecutablePath) || whisperExecutablePath,
      [
        '-m',
        resolveConfigPath(config.modelPath),
        '-f',
        wavPath,
        '-l',
        'zh',
        '-t',
        String(threads),
        '--print-progress',
        '--output-srt',
        '-ng',
      ],
      buildExecOptions(whisperExecutablePath),
    );

    context.children.add(child);
    let errorOutput = '';
    let isTimedOut = false;

    const timeout = setTimeout(() => {
      isTimedOut = true;
      try {
        child.kill();
      } catch {}
    }, WHISPER_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      parser.push(chunk.toString());
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      errorOutput += text;
      if (errorOutput.length > 2000) errorOutput = errorOutput.slice(-2000);
      parser.push(text);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      context.children.delete(child);
      parser.flush();
      if (context.cancelled) {
        reject(new Error('任务已取消'));
        return;
      }
      if (isTimedOut) {
        reject(new Error('whisper 转录超时'));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      const reason = code !== null ? `退出码: ${code}` : `信号: ${signal}`;
      reject(new Error(`whisper 进程退出，${reason}\n${errorOutput.trim()}`));
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      context.children.delete(child);
      reject(error);
    });
  });

  return srtPath;
}

async function saveTranscriptionResult(record, transcript, segments, meta, preferredDir) {
  const outputRoot = resolveConfigPath(preferredDir);
  const episodeDir = record.savedPath || path.join(outputRoot, sanitizeDirName(record.title));
  return writeTranscriptTextFiles(episodeDir, segments, transcript, meta);
}

async function runEngine(context, record, engine, onlineASRConfig) {
  const updateRecord = createRecordUpdateEmitter(record.id);
  const config = await loadConfig();
  const runtimeStatus = buildWhisperStatus(config);

  if (engine === 'qwen-asr') {
    await updateRecord({
      status: 'transcribing',
      progress: 30,
      segments: [],
      transcript: '',
      error: undefined,
    });

    const result = await transcribeWithQwenFileTrans(
      record.audioUrl,
      onlineASRConfig,
      async (patch) => {
        throwIfCancelled(context);
        const nextTranscript = patch.transcript ?? (await getRecord(record.id))?.transcript ?? '';
        await updateRecord({
          status: 'transcribing',
          progress: patch.progress ?? 30,
          transcript: nextTranscript,
        });
      },
      context.controller.signal,
    );

    throwIfCancelled(context);
    const savedPath = await saveTranscriptionResult(
      { ...(await getRecord(record.id)), savedPath: record.savedPath },
      result.transcript,
      result.segments,
      {
        title: record.title,
        sourceUrl: record.sourceUrl,
      },
      config.outputDir,
    );

    await updateRecord({
      status: 'completed',
      progress: 100,
      transcript: result.transcript,
      segments: result.segments,
      wordCount: result.transcript.length,
      language: 'zh',
      savedPath: path.resolve(savedPath),
      error: undefined,
    });
    return;
  }

  if (!runtimeStatus.effectiveWhisperPath) {
    throw new Error('whisper.cpp 未安装或路径无效，请在设置中填写本机路径');
  }
  if (!runtimeStatus.effectiveFfmpegPath) {
    throw new Error('ffmpeg 未安装或路径无效，请在设置中填写本机路径');
  }
  if (!fs.existsSync(resolveConfigPath(config.modelPath))) {
    throw new Error('模型文件不存在，请先下载模型或手动填写模型路径');
  }

  const audioPath = path.join(TEMP_DIR, `audio_${record.id}.mp3`);
  context.tempFiles.add(audioPath);

  await updateRecord({
    status: 'downloading_audio',
    progress: 10,
    segments: [],
    transcript: '',
    error: undefined,
  });
  await downloadFile(record.audioUrl, audioPath, context.controller.signal);
  throwIfCancelled(context);

  await updateRecord({
    status: 'converting',
    progress: 20,
  });

  const wavPath = await convertToWav(audioPath, runtimeStatus.effectiveFfmpegPath, context);
  throwIfCancelled(context);

  const segments = [];
  let currentProgress = TRANSCRIPTION_PROGRESS_START;
  const effectiveThreads = normalizeWhisperThreads(config.threads);
  const transcribingStartedAt = Date.now();

  await updateRecord({
    status: 'transcribing',
    progress: currentProgress,
    segments: [],
    transcript: '',
  });

  const estimatedProgressTimer = setInterval(async () => {
    try {
      throwIfCancelled(context);
      const estimatedProgress = getEstimatedTranscriptionProgress(
        Date.now() - transcribingStartedAt,
        record.duration,
      );
      if (estimatedProgress == null || estimatedProgress <= currentProgress) {
        return;
      }

      currentProgress = estimatedProgress;
      await updateRecord({
        status: 'transcribing',
        progress: currentProgress,
        transcript: buildTranscriptFromSegments(segments),
      });
    } catch {}
  }, 5000);

  let srtPath;
  try {
    srtPath = await runWhisperStreaming(
      wavPath,
      {
        ...config,
        threads: effectiveThreads,
      },
      runtimeStatus.effectiveWhisperPath,
      context,
      async (segment) => {
        throwIfCancelled(context);
        segments.push(segment);
        const segmentProgress = getProgressFromSegment(segment.timestamp, record.duration);
        if (segmentProgress != null) {
          currentProgress = Math.max(currentProgress, segmentProgress);
        }
        await updateRecord({
          status: 'transcribing',
          progress: currentProgress,
          segments: [...segments],
          transcript: buildTranscriptFromSegments(segments),
        });
      },
      async (progress) => {
        throwIfCancelled(context);
        currentProgress = Math.max(currentProgress, getProgressFromWhisperPercent(progress));
        await updateRecord({
          status: 'transcribing',
          progress: currentProgress,
          transcript: buildTranscriptFromSegments(segments),
        });
      },
    );
  } finally {
    clearInterval(estimatedProgressTimer);
  }

  let finalSegments = [...segments];
  if (fs.existsSync(srtPath)) {
    const srtContent = await fsp.readFile(srtPath, 'utf8');
    const parsed = parseSrtSegments(srtContent);
    if (parsed.length >= finalSegments.length) {
      finalSegments = parsed;
    }
  }

  const transcript = buildTranscriptFromSegments(finalSegments).trim();
  const savedPath = await saveTranscriptionResult(
    { ...(await getRecord(record.id)), savedPath: record.savedPath },
    transcript,
    finalSegments,
    {
      title: record.title,
      sourceUrl: record.sourceUrl,
      author: record.author,
      pubDate: record.pubDate,
      description: record.description,
    },
    config.outputDir,
  );

  await updateRecord({
    status: 'completed',
    progress: 100,
    transcript,
    segments: finalSegments,
    wordCount: transcript.length,
    language: 'zh',
    savedPath: path.resolve(savedPath),
    error: undefined,
  });
}

async function runNewTranscription(taskId, sourceUrl, engine, onlineASRConfig) {
  const context = createTaskContext(taskId);

  try {
    await addRecord({
      id: taskId,
      taskId,
      title: '未知标题',
      sourceUrl,
      status: 'fetching_info',
      progress: 0,
      segments: [],
    });

    const episode = await fetchEpisodeInfo(sourceUrl, context.controller.signal);
    throwIfCancelled(context);

    const updateRecord = createRecordUpdateEmitter(taskId);
    await updateRecord({
      title: episode.title,
      audioUrl: episode.audioUrl,
      duration: episode.duration,
      sourceUrl,
      author: episode.author,
      pubDate: episode.pubDate,
      description: episode.description,
    });

    await runEngine(
      context,
      {
        id: taskId,
        title: episode.title,
        audioUrl: episode.audioUrl,
        sourceUrl,
        author: episode.author,
        pubDate: episode.pubDate,
        description: episode.description,
      },
      engine,
      onlineASRConfig,
    );
  } catch (error) {
    const updateRecord = createRecordUpdateEmitter(taskId);
    await updateRecord({
      status: 'error',
      progress: null,
      error:
        error?.code === 'TASK_CANCELLED' || error?.message === '任务已取消'
          ? '任务已取消'
          : error instanceof Error
            ? error.message
            : '处理播客失败',
    });
  } finally {
    await cleanupTaskContext(context);
  }
}

async function runRetranscription(taskId, engine, onlineASRConfig) {
  const record = await getRecord(taskId);
  if (!record) {
    throw new Error('转录记录不存在');
  }
  if (!record.audioUrl) {
    throw new Error('该记录没有音频链接，无法重新转录');
  }

  const context = createTaskContext(taskId);
  const updateRecord = createRecordUpdateEmitter(taskId);

  try {
    await updateRecord({
      status: engine === 'qwen-asr' ? 'transcribing' : 'downloading_audio',
      progress: 0,
      segments: [],
      transcript: '',
      wordCount: undefined,
      language: undefined,
      error: undefined,
    });

    await runEngine(
      context,
      {
        ...record,
        savedPath: record.savedPath,
      },
      engine,
      onlineASRConfig,
    );
  } catch (error) {
    await updateRecord({
      status: 'error',
      progress: null,
      error:
        error?.code === 'TASK_CANCELLED' || error?.message === '任务已取消'
          ? '任务已取消'
          : error instanceof Error
            ? error.message
            : '重新转录失败',
    });
  } finally {
    await cleanupTaskContext(context);
  }
}

async function startModelDownload(modelName) {
  if (!MODEL_URLS[modelName]) {
    throw new Error(`不支持的模型: ${modelName}`);
  }

  if (downloadProgress.status === 'downloading') {
    throw new Error('已有模型下载任务进行中');
  }

  const targetPath = path.join(MODELS_DIR, `ggml-${modelName}.bin`);
  const tempPath = `${targetPath}.${Date.now()}.tmp`;

  downloadProgress = {
    status: 'downloading',
    downloaded: 0,
    total: MODEL_SIZES[modelName],
    modelName,
  };
  emitDownloadProgress();

  try {
    const response = await fetch(MODEL_URLS[modelName]);
    if (!response.ok || !response.body) {
      throw new Error(`下载失败: HTTP ${response.status}`);
    }

    const total = Number.parseInt(
      response.headers.get('content-length') || String(MODEL_SIZES[modelName]),
      10,
    );
    downloadProgress.total = total;
    emitDownloadProgress();

    await ensureAppDirs();
    const fileStream = fs.createWriteStream(tempPath);
    const reader = response.body.getReader();
    let downloadedSize = 0;
    let lastEmitAt = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(Buffer.from(value));
      downloadedSize += value.length;
      const now = Date.now();
      if (now - lastEmitAt > 300) {
        lastEmitAt = now;
        downloadProgress = {
          status: 'downloading',
          downloaded: downloadedSize,
          total,
          modelName,
        };
        emitDownloadProgress();
      }
    }

    await new Promise((resolve, reject) => {
      fileStream.end();
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    });

    await fsp.rename(tempPath, targetPath);

    const config = await loadConfig();
    config.modelName = modelName;
    config.modelPath = targetPath;
    await saveConfig(config);

    downloadProgress = {
      status: 'completed',
      downloaded: total,
      total,
      modelName,
    };
    emitDownloadProgress();
  } catch (error) {
    await safeUnlink(tempPath);
    downloadProgress = {
      status: 'error',
      downloaded: 0,
      total: 0,
      modelName,
      error: error instanceof Error ? error.message : '模型下载失败',
    };
    emitDownloadProgress();
  }
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function parsePathname(req) {
  return new URL(req.url, `http://${req.headers.host}`).pathname;
}

function validateOnlineAsrRequest(engine, onlineASRConfig) {
  if (engine !== 'qwen-asr') {
    return null;
  }

  if (!String(onlineASRConfig?.apiKey || '').trim()) {
    return '千问 ASR API Key 未配置，请在设置中填写';
  }

  return null;
}

async function handleOptions(res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Private-Network': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end();
}

async function handleRequest(req, res) {
  if (req.method === 'OPTIONS') {
    await handleOptions(res);
    return;
  }

  const pathname = parsePathname(req);

  try {
    if (req.method === 'GET' && pathname === '/health') {
      sendJson(res, 200, {
        success: true,
        data: {
          helperConnected: true,
          platform: process.platform,
          installMode: 'mixed',
        },
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/config') {
      const config = await loadConfig();
      sendJson(res, 200, { success: true, data: config });
      return;
    }

    if (req.method === 'PUT' && pathname === '/config') {
      const body = await readJsonBody(req);
      const current = await loadConfig();
      const next = {
        ...current,
        ...body,
        modelName: body.modelName || current.modelName || getDefaultModelName(),
      };
      if (!next.modelPath) {
        next.modelPath = getDefaultModelPath(next.modelName);
      }
      next.threads = Math.max(1, Number.parseInt(String(next.threads || current.threads || 4), 10));
      if (Object.prototype.hasOwnProperty.call(body, 'whisperPath')) {
        next.whisperPathManaged = false;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'ffmpegPath')) {
        next.ffmpegPathManaged = false;
      }
      await saveConfig(next);
      sendJson(res, 200, { success: true, data: next });
      return;
    }

    if (req.method === 'GET' && pathname === '/whisper/status') {
      const config = await loadConfig();
      sendJson(res, 200, { success: true, data: buildWhisperStatus(config) });
      return;
    }

    if (req.method === 'POST' && pathname === '/local-runtime/install') {
      const body = await readJsonBody(req);
      const components = normalizeInstallComponents(body.components);

      if (!components.length) {
        sendJson(res, 400, { success: false, error: '未指定要安装的组件' });
        return;
      }

      if (process.platform !== 'darwin') {
        sendJson(res, 400, { success: false, error: '一键安装当前仅支持 macOS' });
        return;
      }

      if (localRuntimeInstallPromise) {
        sendJson(res, 409, { success: false, error: '已有安装任务正在运行' });
        return;
      }

      localRuntimeInstallPromise = installLocalRuntime(components)
        .catch((error) => {
          appendLocalRuntimeInstallLogs(
            error instanceof Error ? error.message : '本地依赖安装失败',
          );
          updateLocalRuntimeInstallProgress({
            status: 'failed',
            currentStep: localRuntimeInstallProgress.currentStep,
            message: error instanceof Error ? error.message : '本地依赖安装失败',
          });
        })
        .finally(() => {
          localRuntimeInstallPromise = null;
        });

      sendJson(res, 200, { success: true, data: { components } });
      return;
    }

    if (req.method === 'GET' && pathname === '/local-runtime/install-progress') {
      const heartbeat = openSse(res);
      localRuntimeInstallClients.add(res);
      writeSse(res, localRuntimeInstallProgress);
      req.on('close', () => {
        clearInterval(heartbeat);
        localRuntimeInstallClients.delete(res);
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/online-asr/test') {
      const body = await readJsonBody(req);
      const result = await testQwenASRConnection(body);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'POST' && pathname === '/whisper/model/download') {
      const body = await readJsonBody(req);
      const modelName = body.modelName || getDefaultModelName();
      startModelDownload(modelName).catch((error) => {
        downloadProgress = {
          status: 'error',
          downloaded: 0,
          total: 0,
          modelName,
          error: error instanceof Error ? error.message : '模型下载失败',
        };
        emitDownloadProgress();
      });
      sendJson(res, 200, { success: true, data: { modelName } });
      return;
    }

    if (req.method === 'GET' && pathname === '/whisper/model/download-progress') {
      const heartbeat = openSse(res);
      modelDownloadClients.add(res);
      writeSse(res, downloadProgress);
      req.on('close', () => {
        clearInterval(heartbeat);
        modelDownloadClients.delete(res);
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/transcriptions') {
      const records = await listRecords();
      sendJson(res, 200, { success: true, data: records });
      return;
    }

    if (req.method === 'POST' && pathname === '/transcriptions') {
      const body = await readJsonBody(req);
      if (!body.url) {
        sendJson(res, 400, { success: false, error: 'URL is required' });
        return;
      }
      const engine = body.engine || 'local-whisper';
      const onlineAsrError = validateOnlineAsrRequest(engine, body.onlineASRConfig);
      if (onlineAsrError) {
        sendJson(res, 400, { success: false, error: onlineAsrError });
        return;
      }
      const taskId = `${Date.now()}_${randomUUID().slice(0, 8)}`;
      runNewTranscription(taskId, body.url, engine, body.onlineASRConfig).catch(
        () => {},
      );
      sendJson(res, 200, { success: true, data: { taskId } });
      return;
    }

    const transcriptionIdMatch = pathname.match(/^\/transcriptions\/([^/]+)$/);
    if (transcriptionIdMatch && req.method === 'GET') {
      const record = await getRecord(transcriptionIdMatch[1]);
      if (!record) {
        sendJson(res, 404, { success: false, error: '转录记录不存在' });
        return;
      }
      sendJson(res, 200, { success: true, data: record });
      return;
    }

    if (transcriptionIdMatch && req.method === 'DELETE') {
      const taskId = transcriptionIdMatch[1];
      const record = await getRecord(taskId);
      if (!record) {
        sendJson(res, 404, { success: false, error: '转录记录不存在' });
        return;
      }

      await cancelTask(taskId);

      if (record.savedPath) {
        try {
          await fsp.rm(record.savedPath, { recursive: true, force: true });
        } catch {}
      }

      await removeRecord(taskId);
      sendJson(res, 200, { success: true, data: { id: taskId } });
      return;
    }

    const liveMatch = pathname.match(/^\/transcriptions\/([^/]+)\/live$/);
    if (liveMatch && req.method === 'GET') {
      const taskId = liveMatch[1];
      const record = await getRecord(taskId);
      if (!record) {
        sendJson(res, 404, { success: false, error: '转录记录不存在' });
        return;
      }
      const heartbeat = openSse(res);
      const clients = getLiveClientSet(taskId);
      clients.add(res);
      writeSse(res, { success: true, data: record });
      req.on('close', () => {
        clearInterval(heartbeat);
        clients.delete(res);
      });
      return;
    }

    const retranscribeMatch = pathname.match(/^\/transcriptions\/([^/]+)\/retranscribe$/);
    if (retranscribeMatch && req.method === 'POST') {
      const taskId = retranscribeMatch[1];
      const body = await readJsonBody(req);
      const record = await getRecord(taskId);
      if (!record) {
        sendJson(res, 404, { success: false, error: '转录记录不存在' });
        return;
      }
      const engine = body.engine || 'local-whisper';
      const onlineAsrError = validateOnlineAsrRequest(engine, body.onlineASRConfig);
      if (onlineAsrError) {
        sendJson(res, 400, { success: false, error: onlineAsrError });
        return;
      }
      runRetranscription(taskId, engine, body.onlineASRConfig).catch(() => {});
      sendJson(res, 200, { success: true, data: { taskId } });
      return;
    }

    const cancelMatch = pathname.match(/^\/transcriptions\/([^/]+)\/cancel$/);
    if (cancelMatch && req.method === 'POST') {
      await cancelTask(cancelMatch[1]);
      sendJson(res, 200, { success: true });
      return;
    }

    sendJson(res, 404, { success: false, error: 'Not Found' });
  } catch (error) {
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'helper 请求失败',
    });
  }
}

async function start() {
  if (serverInstance) {
    return serverInstance;
  }
  if (startPromise) {
    return startPromise;
  }

  await ensureAppDirs();
  const config = await loadConfig();
  await syncDetectedRuntimeIntoConfig();
  await reconcileInterruptedRecords();
  const importedCount = await importMissingTranscriptHistory(config);
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      sendJson(res, 500, {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      });
    });
  });

  startPromise = new Promise((resolve, reject) => {
    const cleanup = () => {
      server.off('error', handleError);
      server.off('listening', handleListening);
    };

    const handleError = (error) => {
      cleanup();
      startPromise = null;
      reject(error);
    };

    const handleListening = () => {
      cleanup();
      serverInstance = server;
      startPromise = null;
      console.log(`[MemoFlow Helper] listening on http://${HOST}:${PORT}`);
      console.log(`[MemoFlow Helper] app data dir: ${APP_DIR}`);
      if (importedCount > 0) {
        console.log(`[MemoFlow Helper] imported ${importedCount} transcript record(s) from ${config.outputDir}`);
      }
      resolve(server);
    };

    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(PORT, HOST);
  });

  return startPromise;
}

async function stop() {
  if (startPromise) {
    await startPromise;
  }

  if (!serverInstance) {
    return;
  }

  await new Promise((resolve, reject) => {
    serverInstance.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  serverInstance = null;
}

if (require.main === module) {
  start().catch((error) => {
    console.error('[MemoFlow Helper] failed to start:', error);
    process.exit(1);
  });
} else {
  module.exports = { start, stop };
}
