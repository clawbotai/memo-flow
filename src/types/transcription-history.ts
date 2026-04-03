import { TranscribeSegment } from './index';

export interface TranscriptionRecord {
  id: string;                   // 转录记录唯一ID
  taskId: string;              // 任务ID
  title: string;               // 播客标题
  status: 'idle' | 'fetching_info' | 'downloading_audio' | 'converting' | 'transcribing' | 'completed' | 'error'; // 转录状态
  progress: number | null;     // 转录进度 (0-100)
  audioUrl?: string;           // 音频URL
  segments: TranscribeSegment[]; // 已转录的片段
  transcript?: string;         // 完整转录文本
  wordCount?: number;          // 字数统计
  savedPath?: string;          // 文件保存路径
  createdAt: Date;             // 创建时间
  updatedAt: Date;             // 最后更新时间
  language?: string;           // 检测到的语言
  duration?: number;           // 音频时长
}

export interface TranscriptionHistoryState {
  records: TranscriptionRecord[];
  lastUpdated: Date;
}