'use client';

import type {
  ApiResponse,
  LanguageModelModelConfig,
  LanguageModelProviderCard,
  LanguageModelSettings,
  LanguageModelTestResult,
} from "@/types";
import { helperRequest } from "@/lib/local-helper-client";
import { normalizeLanguageModelSettings } from "@/lib/language-models";
import { emitLanguageModelSettingsChanged } from "@/lib/language-model-events";
import {
  mergeCachedLanguageModelSettings,
  readCachedLanguageModelSettings,
  writeCachedLanguageModelSettings,
} from "@/lib/language-model-settings-cache";

export async function fetchLanguageModelSettings(): Promise<LanguageModelSettings> {
  const response = await helperRequest<ApiResponse<LanguageModelSettings>>("/llm/config");
  if (!response.success || !response.data) {
    throw new Error(response.error || "读取语言模型设置失败");
  }

  const remoteSettings = normalizeLanguageModelSettings(response.data);
  const mergedSettings = mergeCachedLanguageModelSettings(
    remoteSettings,
    readCachedLanguageModelSettings(),
  );
  writeCachedLanguageModelSettings(mergedSettings);
  return mergedSettings;
}

export async function saveLanguageModelSettings(
  providers: LanguageModelProviderCard[],
): Promise<LanguageModelSettings> {
  const response = await helperRequest<ApiResponse<LanguageModelSettings>>("/llm/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providers }),
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || "保存语言模型设置失败");
  }

  const nextSettings = normalizeLanguageModelSettings(response.data);
  writeCachedLanguageModelSettings(nextSettings);
  emitLanguageModelSettingsChanged();
  return nextSettings;
}

export async function testLanguageModelConnection(
  providerId: string,
  modelId: string,
  modelConfig: LanguageModelModelConfig,
  connection: Pick<LanguageModelProviderCard, "apiKey" | "apiKeyConfigured" | "baseUrl" | "apiFormat" | "name" | "presetType" | "kind">,
): Promise<LanguageModelTestResult> {
  const response = await helperRequest<ApiResponse<LanguageModelTestResult>>("/llm/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerId, modelId, config: { ...modelConfig, ...connection } }),
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || "语言模型连接测试失败");
  }

  return response.data;
}
