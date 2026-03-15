import { ApiResponse, Analysis, Note, Content } from '@/types';

const API_BASE = '/api';

export async function parseUrl(url: string): Promise<ApiResponse<Content>> {
  try {
    const response = await fetch(`${API_BASE}/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    return await response.json();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '解析失败'
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
