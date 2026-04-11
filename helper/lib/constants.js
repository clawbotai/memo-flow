'use strict';

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
const LANGUAGE_MODEL_PROVIDERS = [
  'openai',
  'claude',
  'anthropic-third-party',
  'gemini',
  'qwen',
  'zhipu',
];
const LLM_TEST_TIMEOUT_MS = 20000;
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:1420',
  'http://127.0.0.1:1420',
  'tauri://localhost',
  'https://tauri.localhost',
  'http://tauri.localhost',
];
const HOMEBREW_INSTALL_COMMAND =
  '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';
const PLAIN_TRANSCRIPT_FILE = '纯文本.txt';
const TIMESTAMPED_TRANSCRIPT_FILE = '逐字稿.txt';
const MINDMAP_FILE = '思维导图.json';
const CONTENT_POINTS_FILE = 'content-points.json';
const CONTENT_DRAFTS_FILE = 'content-drafts.json';

module.exports = {
  APP_NAME,
  HOST,
  PORT,
  MODEL_URLS,
  MODEL_SIZES,
  ANSI_REGEX,
  SEGMENT_REGEX,
  PROGRESS_REGEX,
  FILETRANS_POLL_INTERVAL_MS,
  FILETRANS_TIMEOUT_MS,
  WHISPER_TIMEOUT_MS,
  SSE_HEARTBEAT_INTERVAL_MS,
  INSTALL_LOG_TAIL_LIMIT,
  TRANSCRIPTION_PROGRESS_START,
  TRANSCRIPTION_PROGRESS_END,
  DEFAULT_QWEN_BASE_URL,
  DEFAULT_QWEN_TEST_MODEL,
  LANGUAGE_MODEL_PROVIDERS,
  LLM_TEST_TIMEOUT_MS,
  DEFAULT_ALLOWED_ORIGINS,
  HOMEBREW_INSTALL_COMMAND,
  PLAIN_TRANSCRIPT_FILE,
  TIMESTAMPED_TRANSCRIPT_FILE,
  MINDMAP_FILE,
  CONTENT_POINTS_FILE,
  CONTENT_DRAFTS_FILE,
};
