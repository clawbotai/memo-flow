'use client';

import type {
  ApiResponse,
  LanguageModelProvider,
  LanguageModelProviderConfig,
  LanguageModelSettings,
  LanguageModelTestResult,
} from "@/types";
import { helperRequest } from "@/lib/local-helper-client";

export async function fetchLanguageModelSettings(): Promise<LanguageModelSettings> {
  const response = await helperRequest<ApiResponse<LanguageModelSettings>>("/llm/config");
  if (!response.success || !response.data) {
    throw new Error(response.error || "读取语言模型设置失败");
  }
  return response.data;
}

export async function saveLanguageModelSettings(
  providers: Partial<Record<LanguageModelProvider, Partial<LanguageModelProviderConfig>>>,
): Promise<LanguageModelSettings> {
  const response = await helperRequest<ApiResponse<LanguageModelSettings>>("/llm/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providers }),
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || "保存语言模型设置失败");
  }

  return response.data;
}

export async function testLanguageModelConnection(
  provider: LanguageModelProvider,
  config: LanguageModelProviderConfig,
): Promise<LanguageModelTestResult> {
  const response = await helperRequest<ApiResponse<LanguageModelTestResult>>("/llm/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, config }),
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || "语言模型连接测试失败");
  }

  return response.data;
}
