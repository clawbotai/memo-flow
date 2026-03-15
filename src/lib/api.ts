import { ApiResponse, Analysis, Note, Content } from '@/types';

const API_BASE = '/api';

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function parseUrl(url: string): Promise<ApiResponse<Content>> {
  try {
    const response = await fetch(`${API_BASE}/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new ApiError(error.code || 'PARSE_ERROR', error.error || '解析失败');
    }

    return await response.json();
  } catch (error) {
    console.error('Parse error:', error);
    return {
      success: false,
      error: error instanceof ApiError ? error.message : '网络错误，请检查连接'
    };
  }
}

export async function analyzeContent(contentId: string): Promise<ApiResponse<Analysis>> {
  try {
    const response = await fetch(`${API_BASE}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentId })
    });
    return await response.json();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '分析失败'
    };
  }
}

export async function generateNote(analysisId: string, template: string = 'default'): Promise<ApiResponse<Note>> {
  try {
    const response = await fetch(`${API_BASE}/note/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysisId, template })
    });
    return await response.json();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '生成失败'
    };
  }
}

export async function getAnalysis(id: string): Promise<ApiResponse<Analysis>> {
  try {
    const response = await fetch(`${API_BASE}/analysis/${id}`);
    return await response.json();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '获取失败'
    };
  }
}

export async function getNotes(): Promise<ApiResponse<Note[]>> {
  try {
    const response = await fetch(`${API_BASE}/notes`);
    return await response.json();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '获取失败'
    };
  }
}
