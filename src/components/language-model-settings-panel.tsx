"use client";

import * as React from "react";
import {
  Bot,
  BrainCircuit,
  Check,
  Eraser,
  Eye,
  EyeOff,
  Loader2,
  Orbit,
  RefreshCw,
  Save,
  Sparkles,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguageModelSettings } from "@/hooks/use-language-model-settings";
import { cn } from "@/lib/utils";
import {
  LANGUAGE_MODEL_PROVIDER_META,
  LANGUAGE_MODEL_PROVIDER_ORDER,
} from "@/lib/language-models";
import type { LanguageModelProvider, LanguageModelTestResult } from "@/types";

const PROVIDER_ICONS: Record<LanguageModelProvider, React.ComponentType<{ className?: string }>> = {
  openai: Sparkles,
  claude: Bot,
  gemini: Orbit,
  qwen: Zap,
  zhipu: BrainCircuit,
};

interface LanguageModelSettingsPanelProps {
  visible: boolean;
}

function clampTemperature(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.7;
  }
  return Math.max(0, Math.min(2, value));
}

function clampMaxTokens(value: number): number {
  if (!Number.isFinite(value)) {
    return 4096;
  }
  return Math.max(1, Math.min(128000, Math.floor(value)));
}

export function LanguageModelSettingsPanel({ visible }: LanguageModelSettingsPanelProps) {
  const {
    settings,
    loaded,
    loading,
    loadError,
    savingProvider,
    testingProvider,
    dirtyProviders,
    testResults,
    reload,
    updateProviderConfig,
    saveProviderConfig,
    testProviderConfig,
  } = useLanguageModelSettings();
  const [activeProvider, setActiveProvider] = React.useState<LanguageModelProvider>("openai");
  const [showApiKey, setShowApiKey] = React.useState<Partial<Record<LanguageModelProvider, boolean>>>(
    {},
  );
  const [providerFeedback, setProviderFeedback] = React.useState<
    Partial<Record<LanguageModelProvider, LanguageModelTestResult>>
  >({});

  const activeConfig = settings.providers[activeProvider];
  const activeMeta = LANGUAGE_MODEL_PROVIDER_META[activeProvider];
  const activeTestResult = providerFeedback[activeProvider] || testResults[activeProvider];
  const hasSavedApiKey = activeConfig.apiKeyConfigured === true;
  const hasUsableApiKey = hasSavedApiKey || activeConfig.apiKey.trim().length > 0;

  React.useEffect(() => {
    if (visible && !loaded && !loading) {
      void reload();
    }
  }, [loaded, loading, reload, visible]);

  const handleSave = async () => {
    try {
      await saveProviderConfig(activeProvider);
      setProviderFeedback((prev) => ({
        ...prev,
        [activeProvider]: {
          success: true,
          message: "设置已保存",
          provider: activeProvider,
        },
      }));
    } catch (error) {
      setProviderFeedback((prev) => ({
        ...prev,
        [activeProvider]: {
          success: false,
          message: error instanceof Error ? error.message : "保存失败",
          provider: activeProvider,
        },
      }));
    }
  };

  const handleTest = async () => {
    try {
      const result = await testProviderConfig(activeProvider);
      setProviderFeedback((prev) => ({
        ...prev,
        [activeProvider]: result,
      }));
    } catch (error) {
      setProviderFeedback((prev) => ({
        ...prev,
        [activeProvider]: {
          success: false,
          message: error instanceof Error ? error.message : "测试失败",
          provider: activeProvider,
        },
      }));
    }
  };

  if (!loaded && loading) {
    return (
      <section aria-hidden={!visible} className={cn("space-y-6", !visible && "hidden")}>
        <div className="flex items-center justify-center py-14">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  return (
    <section aria-hidden={!visible} className={cn("space-y-6", !visible && "hidden")}>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">语言模型</h3>
        <p className="text-sm text-muted-foreground">
          配置文本大模型 Provider。
        </p>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-destructive">读取语言模型设置失败</div>
              <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void reload()}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              重试
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-border/60 bg-card/80 p-3 shadow-sm shadow-primary/5">
          <div className="mb-3 flex items-center justify-between px-2">
            <div>
              <h4 className="text-sm font-medium">Provider</h4>
              <p className="mt-1 text-xs text-muted-foreground">按服务商分别保存配置。</p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {LANGUAGE_MODEL_PROVIDER_ORDER.map((provider) => {
              const meta = LANGUAGE_MODEL_PROVIDER_META[provider];
              const Icon = PROVIDER_ICONS[provider];
              const isActive = provider === activeProvider;
              const isEnabled = settings.providers[provider]?.enabled;
              const isDirty = dirtyProviders.has(provider);

              return (
                <button
                  key={provider}
                  type="button"
                  onClick={() => setActiveProvider(provider)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-all",
                    isActive
                      ? "border-primary/30 bg-background shadow-sm shadow-primary/10"
                      : "border-transparent text-muted-foreground hover:border-border/60 hover:bg-background/70 hover:text-foreground",
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
                      isActive
                        ? "border-primary/30 bg-primary/12 text-primary"
                        : "border-border/60 bg-background/80 text-muted-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{meta.label}</span>
                      <Badge variant={isEnabled ? "default" : "secondary"} className="px-1.5 py-0 text-[10px]">
                        {isEnabled ? "已启用" : "未启用"}
                      </Badge>
                      {isDirty && (
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                          未保存
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {meta.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm shadow-primary/5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {React.createElement(PROVIDER_ICONS[activeProvider], {
                  className: "h-5 w-5 text-primary",
                })}
                <h4 className="text-base font-semibold">{activeMeta.label}</h4>
              </div>
              <p className="text-sm text-muted-foreground">{activeMeta.description}</p>
            </div>

            <button
              type="button"
              onClick={() =>
                updateProviderConfig(activeProvider, { enabled: !activeConfig.enabled })
              }
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                activeConfig.enabled
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border/60 bg-background/80 text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  activeConfig.enabled ? "bg-primary" : "bg-muted-foreground/50",
                )}
              />
              {activeConfig.enabled ? "已启用该 Provider" : "点击启用该 Provider"}
            </button>
          </div>

          <div className="mt-6 grid gap-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-medium">API Key</label>
                {hasSavedApiKey && !activeConfig.apiKey && (
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    已保存
                  </Badge>
                )}
              </div>
              <div className="relative">
                <Input
                  type={showApiKey[activeProvider] ? "text" : "password"}
                  value={activeConfig.apiKey}
                  onChange={(event) =>
                    updateProviderConfig(activeProvider, { apiKey: event.target.value })
                  }
                  placeholder={
                    hasSavedApiKey && !activeConfig.apiKey
                      ? "已保存 API Key，如需更换请重新输入"
                      : activeMeta.apiKeyPlaceholder
                  }
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() =>
                    setShowApiKey((prev) => ({
                      ...prev,
                      [activeProvider]: !prev[activeProvider],
                    }))
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showApiKey[activeProvider] ? "隐藏 API Key" : "显示 API Key"}
                >
                  {showApiKey[activeProvider] ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {hasSavedApiKey && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      updateProviderConfig(activeProvider, {
                        apiKey: "",
                        apiKeyConfigured: false,
                      })
                    }
                  >
                    <Eraser className="mr-2 h-3.5 w-3.5" />
                    清除已保存密钥
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium">Model</label>
              <Input
                list={`llm-model-suggestions-${activeProvider}`}
                value={activeConfig.model}
                onChange={(event) =>
                  updateProviderConfig(activeProvider, { model: event.target.value })
                }
                placeholder="填写模型名或从建议中选择"
              />
              <datalist id={`llm-model-suggestions-${activeProvider}`}>
                {activeMeta.modelSuggestions.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                可直接输入自定义模型名，内置建议仅作为快捷起点。
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium">Base URL</label>
              <Input
                value={activeConfig.baseUrl}
                onChange={(event) =>
                  updateProviderConfig(activeProvider, { baseUrl: event.target.value })
                }
                placeholder="https://..."
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium">Temperature</label>
                <Input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={activeConfig.temperature}
                  onChange={(event) =>
                    updateProviderConfig(activeProvider, {
                      temperature: clampTemperature(Number.parseFloat(event.target.value)),
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">默认 0.7，允许范围 0 到 2。</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium">Max Tokens</label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={activeConfig.maxTokens}
                  onChange={(event) =>
                    updateProviderConfig(activeProvider, {
                      maxTokens: clampMaxTokens(Number.parseInt(event.target.value, 10)),
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">用于测试和后续生成时的输出上限。</p>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-border/60 bg-background/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <h5 className="text-sm font-medium">当前状态</h5>
                <p className="text-xs text-muted-foreground">
                  已保存与测试结果都按 provider 单独维护。
                </p>
                {activeTestResult && (
                  <p
                    className={cn(
                      "text-xs",
                      activeTestResult.success
                        ? "text-green-600 dark:text-green-400"
                        : "text-destructive",
                    )}
                  >
                    {activeTestResult.message}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={handleTest}
                  disabled={testingProvider === activeProvider || !hasUsableApiKey}
                >
                  {testingProvider === activeProvider ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      测试中...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      测试连接
                    </>
                  )}
                </Button>

                <Button
                  onClick={handleSave}
                  disabled={savingProvider === activeProvider || !dirtyProviders.has(activeProvider)}
                >
                  {savingProvider === activeProvider ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      保存中...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      保存设置
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                测试连接使用当前输入框中的值（未保存的修改同样生效）。
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {activeMeta.modelSuggestions.map((model) => (
              <button
                key={model}
                type="button"
                onClick={() => updateProviderConfig(activeProvider, { model })}
                className="rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
              >
                {model}
              </button>
            ))}
            {activeTestResult?.success && (
              <Badge className="gap-1 rounded-full px-3 py-1.5">
                <Check className="h-3 w-3" />
                最近一次测试通过
              </Badge>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
