"use client";

import * as React from "react";
import type {
  LanguageModelProvider,
  LanguageModelProviderConfig,
  LanguageModelSettings,
  LanguageModelTestResult,
} from "@/types";
import { createDefaultLanguageModelSettings } from "@/lib/language-models";
import {
  fetchLanguageModelSettings,
  saveLanguageModelSettings,
  testLanguageModelConnection,
} from "@/lib/language-model-settings";

export function useLanguageModelSettings() {
  const [settings, setSettings] = React.useState<LanguageModelSettings>(
    createDefaultLanguageModelSettings,
  );
  const [loaded, setLoaded] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [savingProvider, setSavingProvider] = React.useState<LanguageModelProvider | null>(null);
  const [testingProvider, setTestingProvider] = React.useState<LanguageModelProvider | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [dirtyProviders, setDirtyProviders] = React.useState<Set<LanguageModelProvider>>(new Set());
  const [testResults, setTestResults] = React.useState<
    Partial<Record<LanguageModelProvider, LanguageModelTestResult>>
  >({});

  const loadSettings = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const next = await fetchLanguageModelSettings();
      setSettings(next);
      setDirtyProviders(new Set());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "读取语言模型设置失败");
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  // 不在 mount 时自动加载——由调用方（Panel）根据 visible 状态按需触发 reload()，
  // 避免设置对话框未打开时就发出网络请求。

  const updateProviderConfig = React.useCallback(
    (
      provider: LanguageModelProvider,
      updates: Partial<LanguageModelProviderConfig>,
    ) => {
      setSettings((prev) => ({
        providers: {
          ...prev.providers,
          [provider]: {
            ...prev.providers[provider],
            ...updates,
          },
        },
      }));

      setDirtyProviders((prev) => {
        const next = new Set(prev);
        next.add(provider);
        return next;
      });

      setTestResults((prev) => {
        if (!prev[provider]) {
          return prev;
        }
        return {
          ...prev,
          [provider]: undefined,
        };
      });
    },
    [],
  );

  const saveProviderConfig = React.useCallback(
    async (provider: LanguageModelProvider) => {
      setSavingProvider(provider);

      try {
        const currentConfig = settings.providers[provider] ?? createDefaultLanguageModelSettings().providers[provider];
        const next = await saveLanguageModelSettings({
          [provider]: currentConfig,
        });
        setSettings(next);
        // dirty 状态仅在保存成功后清除，保存失败时保留，方便用户重试
        setDirtyProviders((prev) => {
          const updated = new Set(prev);
          updated.delete(provider);
          return updated;
        });
      } finally {
        setSavingProvider(null);
      }
    },
    [settings.providers],
  );

  const testProviderConfig = React.useCallback(
    async (provider: LanguageModelProvider) => {
      setTestingProvider(provider);

      try {
        const currentConfig = settings.providers[provider] ?? createDefaultLanguageModelSettings().providers[provider];
        const result = await testLanguageModelConnection(provider, currentConfig);
        setTestResults((prev) => ({
          ...prev,
          [provider]: result,
        }));
        return result;
      } finally {
        setTestingProvider(null);
      }
    },
    [settings.providers],
  );

  return {
    settings,
    loaded,
    loading,
    loadError,
    savingProvider,
    testingProvider,
    dirtyProviders,
    testResults,
    reload: loadSettings,
    updateProviderConfig,
    saveProviderConfig,
    testProviderConfig,
  };
}
