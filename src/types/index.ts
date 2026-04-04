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
  whisperInstalled: boolean;
  modelInstalled: boolean;
  ffmpegInstalled: boolean;
  whisperPath: string;
  modelPath: string;
  modelName: string;
  modelSize: string; // 文件大小的可读字符串，如 "462 MB"
  ffmpegPath: string;
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
