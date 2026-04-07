export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface WhisperConfig {
  whisperPath: string;
  modelPath: string;
  modelName: string; // 'small' | 'medium'
  threads: number;
  outputDir: string;
  ffmpegPath: string;
}

export interface WhisperStatus {
  helperConnected: boolean;
  whisperInstalled: boolean;
  modelInstalled: boolean;
  ffmpegInstalled: boolean;
  whisperPath: string;
  modelPath: string;
  modelName: string;
  modelSize: string; // 文件大小的可读字符串，如 "462 MB"
  ffmpegPath: string;
  platform: string;
  installMode: 'mixed';
}

export interface TranscribeSegment {
  timestamp: string; // e.g. "[00:00:00.000 --> 00:00:05.000]"
  text: string;
}

export interface TranscribeProgress {
  taskId: string;
  status: 'idle' | 'fetching_info' | 'downloading_audio' | 'converting' | 'transcribing' | 'completed' | 'error';
  stage: string;
  segments: TranscribeSegment[];
  transcript?: string;
  audioUrl?: string;
  wordCount?: number;
  language?: string;
  progress?: number;
  error?: string;
  episodeTitle?: string;
  savedPath?: string;
}

// ─── 转录引擎相关类型 ───

/** 转录引擎类型 */
export type TranscriptionEngineType = 'local-whisper' | 'qwen-asr';

/** 在线 ASR 模型配置 */
export interface OnlineASRConfig {
  provider: 'qwen';
  modelName: string;       // e.g. 'qwen3-asr-flash'
  apiKey: string;
  baseUrl: string;         // DashScope API endpoint
  enableITN: boolean;      // 逆文本正则化（数字/日期标准化）
}

/** 浏览器本地配置（localStorage） */
export interface BrowserTranscriptionConfig {
  activeEngine: TranscriptionEngineType;
  onlineASR: OnlineASRConfig;
}

/** 兼容旧调用方，保留该类型名 */
export type TranscriptionConfig = BrowserTranscriptionConfig;
