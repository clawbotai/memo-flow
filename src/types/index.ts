export type Platform = 'youtube' | 'xiaoyuzhou' | 'xiaohongshu' | 'bilibili' | 'unknown';

export type AnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Content {
  id: string;
  url: string;
  platform: Platform;
  title: string;
  description: string;
  duration?: number;
  transcript?: string;
  thumbnail?: string;
  author?: string;
  publishedAt?: string;
}

export interface Viewpoint {
  id: string;
  title: string;
  arguments: string[];
}

export interface Controversy {
  id: string;
  topic: string;
  pro: string;
  con: string;
}

export interface Analysis {
  id: string;
  content: Content;
  status: AnalysisStatus;
  viewpoints: Viewpoint[];
  controversies: Controversy[];
  summary: string;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  analysisId: string;
  title: string;
  content: string;
  tags: string[];
  platform: Platform;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
