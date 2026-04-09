'use client';

import type { ApiResponse, LanguageModelProvider } from "@/types";
import type { MindMapDocument } from "@/types/mindmap";
import { helperRequest } from "@/lib/local-helper-client";

export interface MindMapResponse {
  document: MindMapDocument;
}

export interface GenerateMindMapRequest {
  provider: LanguageModelProvider;
}

export async function fetchTranscriptionMindMap(id: string): Promise<MindMapDocument> {
  const response = await helperRequest<ApiResponse<MindMapResponse>>(`/transcriptions/${id}/mindmap`);
  if (!response.success || !response.data?.document) {
    throw new Error(response.error || "读取思维导图失败");
  }
  return response.data.document;
}

export async function generateTranscriptionMindMap(
  id: string,
  payload: GenerateMindMapRequest,
): Promise<MindMapDocument> {
  const response = await helperRequest<ApiResponse<MindMapResponse>>(`/transcriptions/${id}/mindmap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.success || !response.data?.document) {
    throw new Error(response.error || "生成思维导图失败");
  }
  return response.data.document;
}

export async function saveTranscriptionMindMap(
  id: string,
  document: MindMapDocument,
): Promise<MindMapDocument> {
  const response = await helperRequest<ApiResponse<MindMapResponse>>(`/transcriptions/${id}/mindmap`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document }),
  });
  if (!response.success || !response.data?.document) {
    throw new Error(response.error || "保存思维导图失败");
  }
  return response.data.document;
}
