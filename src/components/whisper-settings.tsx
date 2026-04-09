"use client";

import * as React from "react";
import {
  Check,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Mic,
  Monitor,
  Moon,
  Settings,
  Sun,
  Terminal,
  Zap,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LanguageModelSettingsPanel } from "@/components/language-model-settings-panel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  LocalRuntimeInstallProgress,
  LocalRuntimeInstallableComponent,
  WhisperConfig,
  WhisperStatus,
  TranscriptionEngineType,
} from "@/types";
import { useTranscriptionConfig } from "@/hooks/use-transcription-config";
import {
  createHelperEventSource,
  helperRequest,
  isHelperUnavailableError,
} from "@/lib/local-helper-client";
import { emitLocalRuntimeStatusChanged } from "@/lib/local-runtime-events";
import {
  normalizeWhisperStatus,
  type NormalizedWhisperStatus,
} from "@/lib/whisper-status";

interface WhisperSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSection?: SettingsSection;
}

type SettingsSection = "general" | "language-models" | "transcription" | "whisper";
export type { SettingsSection };

interface DownloadProgress {
  status: "idle" | "downloading" | "completed" | "error";
  downloaded: number;
  total: number;
  modelName: string;
  percent?: number;
  error?: string;
}

const SETTINGS_SECTIONS: Array<{
  id: SettingsSection;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    id: "general",
    label: "通用",
    description: "主题外观",
    icon: <Settings className="h-4 w-4" />,
  },
  {
    id: "language-models",
    label: "语言模型",
    description: "文本大模型 Provider",
    icon: <Zap className="h-4 w-4" />,
  },
  {
    id: "transcription",
    label: "转录",
    description: "语音识别引擎",
    icon: <Mic className="h-4 w-4" />,
  },
  {
    id: "whisper",
    label: "Whisper 设置",
    description: "本地转录环境",
    icon: <Terminal className="h-4 w-4" />,
  },
];

const MODEL_OPTIONS = [
  {
    id: "small" as const,
    name: "Small 模型",
    description: "速度快，适合日常使用",
    size: "~460 MB",
  },
  {
    id: "medium" as const,
    name: "Medium 模型",
    description: "质量更好，适合专业场景",
    size: "~1.5 GB",
  },
];

const THEME_OPTIONS = [
  {
    id: "system" as const,
    label: "跟随系统",
    description: "自动匹配当前设备的浅色或深色外观",
    icon: Monitor,
  },
  {
    id: "light" as const,
    label: "浅色",
    description: "使用浅米色和森林绿的明亮界面",
    icon: Sun,
  },
  {
    id: "dark" as const,
    label: "深色",
    description: "使用低眩光的深色阅读界面",
    icon: Moon,
  },
];

const MANUAL_INSTALL_COMMANDS = [
  '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
  "brew install whisper-cpp",
  "brew install ffmpeg",
].join("\n");

const REQUIREMENT_LABELS: Record<string, string> = {
  homebrew: "Homebrew",
  whisper: "whisper.cpp",
  ffmpeg: "ffmpeg",
  model: "模型文件",
};

function getExecutableSourceLabel(source: WhisperStatus["whisperSource"]): string {
  switch (source) {
    case "configured":
      return "已使用用户手动配置";
    case "detected":
      return "已使用用户本机安装";
    default:
      return "缺失";
  }
}

function getInstallComponents(
  status: NormalizedWhisperStatus | null,
): LocalRuntimeInstallableComponent[] {
  if (!status) {
    return [];
  }

  const ordered: LocalRuntimeInstallableComponent[] = ["homebrew", "whisper", "ffmpeg"];
  return ordered.filter((component) => status.missingRequirements?.includes(component));
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function GeneralSettingsPanel({ visible }: { visible: boolean }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const currentTheme = mounted ? (theme ?? "system") : "system";

  return (
    <section aria-hidden={!visible} className={cn("space-y-6", !visible && "hidden")}>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">通用</h3>
        <p className="text-sm text-muted-foreground">
          管理应用的主题外观。主题切换会立即生效并自动保存。
        </p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm shadow-primary/5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="text-sm font-medium">主题</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              选择 Linksy 的显示模式。
              {mounted && resolvedTheme && (
                <span className="ml-1">当前实际显示为{resolvedTheme === "dark" ? "深色" : "浅色"}。</span>
              )}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = currentTheme === option.id;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setTheme(option.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left transition-all",
                  selected
                    ? "border-primary bg-primary/8 shadow-sm shadow-primary/10"
                    : "border-border/60 bg-background/80 hover:border-primary/35 hover:bg-accent/20"
                )}
                disabled={!mounted}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border",
                      selected
                        ? "border-primary/30 bg-primary/12 text-primary"
                        : "border-border/60 bg-card text-muted-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{option.label}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{option.description}</div>
                  </div>
                </div>

                <div
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors",
                    selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
                  )}
                >
                  {selected && <Check className="h-3 w-3" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function WhisperPanel({
  open,
  visible,
  onClose,
}: {
  open: boolean;
  visible: boolean;
  onClose: () => void;
}) {
  const [helperConnected, setHelperConnected] = React.useState(false);
  const [status, setStatus] = React.useState<NormalizedWhisperStatus | null>(null);
  const [config, setConfig] = React.useState<WhisperConfig>({
    whisperPath: "",
    modelPath: "",
    modelName: "small",
    threads: 4,
    outputDir: "",
    ffmpegPath: "",
  });
  const [defaultConfig, setDefaultConfig] = React.useState<WhisperConfig | null>(null);
  const [selectedModel, setSelectedModel] = React.useState<"small" | "medium">("small");
  const [downloading, setDownloading] = React.useState(false);
  const [downloadProgress, setDownloadProgress] = React.useState<DownloadProgress | null>(null);
  const [installProgress, setInstallProgress] = React.useState<LocalRuntimeInstallProgress | null>(
    null,
  );
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [showManualCommands, setShowManualCommands] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const downloadEsRef = React.useRef<EventSource | null>(null);
  const installEsRef = React.useRef<EventSource | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthResult, configResult, statusResult] = await Promise.all([
        helperRequest<{ success: boolean; data: { helperConnected: boolean } }>("/health"),
        helperRequest<{ success: boolean; data: WhisperConfig }>("/config"),
        helperRequest<{ success: boolean; data: WhisperStatus }>("/whisper/status"),
      ]);

      if (healthResult.success) {
        setHelperConnected(healthResult.data.helperConnected);
      }

      if (configResult.success) {
        setConfig(configResult.data);
        setSelectedModel((configResult.data.modelName as "small" | "medium") || "small");
        setDefaultConfig((prev) => prev ?? configResult.data);
      }

      if (statusResult.success) {
        setStatus(normalizeWhisperStatus(statusResult.data));
        emitLocalRuntimeStatusChanged();
      }
    } catch (err) {
      setHelperConnected(false);
      setStatus(null);
      if (isHelperUnavailableError(err)) {
        setError("未检测到本机 helper 服务，请先在电脑上启动 `npm run helper`。");
      } else {
        setError("加载本机环境状态失败，请重试");
      }
      console.error("加载 helper 状态失败:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, loadData]);

  React.useEffect(() => {
    return () => {
      downloadEsRef.current?.close();
      installEsRef.current?.close();
    };
  }, []);

  React.useEffect(() => {
    if (!open) {
      installEsRef.current?.close();
      installEsRef.current = null;
      return;
    }

    installEsRef.current?.close();
    const es = createHelperEventSource("/local-runtime/install-progress");
    installEsRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as LocalRuntimeInstallProgress;
        setInstallProgress(data);

        if (data.status === "succeeded" || data.status === "failed") {
          loadData();
        }
      } catch (err) {
        console.error("解析本地安装进度失败:", err);
      }
    };

    es.onerror = () => {
      es.close();
      if (installEsRef.current === es) {
        installEsRef.current = null;
      }
    };

    return () => {
      es.close();
      if (installEsRef.current === es) {
        installEsRef.current = null;
      }
    };
  }, [loadData, open]);

  const startDownloadTracking = React.useCallback(() => {
    downloadEsRef.current?.close();

    const es = createHelperEventSource("/whisper/model/download-progress");
    downloadEsRef.current = es;

    es.onmessage = (event) => {
      try {
        const data: DownloadProgress = JSON.parse(event.data);
        setDownloadProgress(data);

        if (data.status === "completed") {
          setDownloading(false);
          es.close();
          downloadEsRef.current = null;
          loadData();
        } else if (data.status === "error") {
          setDownloading(false);
          setError(data.error || "下载失败");
          es.close();
          downloadEsRef.current = null;
        }
      } catch (err) {
        console.error("解析进度数据失败:", err);
      }
    };

    es.onerror = () => {
      setDownloading(false);
      es.close();
      downloadEsRef.current = null;
    };
  }, [loadData]);

  const handleDownloadModel = async () => {
    setError(null);
    setDownloading(true);
    setDownloadProgress(null);

    try {
      await helperRequest<{ success: boolean }>("/whisper/model/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelName: selectedModel }),
      });

      startDownloadTracking();
    } catch (err) {
      setDownloading(false);
      setError(err instanceof Error ? err.message : "启动下载失败");
    }
  };

  const handleDownload = async () => {
    await handleDownloadModel();
  };

  const handleInstallRuntime = async () => {
    const components = getInstallComponents(status);
    if (!components.length) {
      return;
    }

    setError(null);

    try {
      await helperRequest<{ success: boolean }>("/local-runtime/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ components }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "启动本地依赖安装失败");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const result = await helperRequest<{ success: boolean; data: WhisperConfig }>("/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (result.success) {
        setConfig(result.data);
      }
      await loadData();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存配置失败");
    } finally {
      setSaving(false);
    }
  };

  const handleModelSelect = (modelId: "small" | "medium") => {
    setSelectedModel(modelId);
    setConfig((prev) => ({
      ...prev,
      modelName: modelId,
      modelPath: prev.modelPath.replace(/ggml-\w+\.bin$/, `ggml-${modelId}.bin`),
    }));
  };

  const handleConfigChange = (field: keyof WhisperConfig, value: string | number) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleResetProjectPaths = () => {
    if (!defaultConfig) return;
    setConfig({
      ...defaultConfig,
      modelName: selectedModel,
      modelPath: defaultConfig.modelPath.replace(/ggml-\w+\.bin$/i, `ggml-${selectedModel}.bin`),
    });
  };

  const modelExists = status?.modelName === selectedModel && status?.modelInstalled;
  const installingRuntime = installProgress?.status === "running";
  const installComponents = getInstallComponents(status);
  const isBusy = downloading || saving || installingRuntime;
  const platformLabel = status?.platform === "win32" ? "Windows" : status?.platform === "darwin" ? "macOS" : status?.platform ?? "本机";

  const getDownloadButtonContent = () => {
    if (downloading) {
      return (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          下载中...
        </>
      );
    }
    if (modelExists) {
      return (
        <>
          <Download className="mr-2 h-4 w-4" />
          重新下载
        </>
      );
    }
    return (
      <>
        <Download className="mr-2 h-4 w-4" />
        下载模型
      </>
    );
  };

  const runtimeChecklist = status
    ? [
        {
          id: "homebrew",
          label: "Homebrew",
          installed: status.homebrewInstalled,
          detail: status.isLegacyPayload
            ? "当前 helper 未返回 Homebrew 的精确检测信息；重启 helper 后会刷新。"
            : status.homebrewInstalled
              ? status.homebrewPath || "已检测到 Homebrew"
              : "缺少 Homebrew，一键安装将先安装它",
          stateLabel: status.isLegacyPayload
            ? "旧版 helper"
            : status.homebrewInstalled
              ? "已检测到"
              : "缺失",
        },
        {
          id: "whisper",
          label: "whisper.cpp",
          installed: status.whisperInstalled,
          detail: status.whisperInstalled
            ? status.effectiveWhisperPath || status.whisperPath
            : "未检测到可用的 whisper 可执行文件",
          stateLabel: getExecutableSourceLabel(status.whisperSource),
        },
        {
          id: "ffmpeg",
          label: "ffmpeg",
          installed: status.ffmpegInstalled,
          detail: status.ffmpegInstalled
            ? status.effectiveFfmpegPath || status.ffmpegPath
            : "未检测到可用的 ffmpeg，可先用一键安装补齐",
          stateLabel: getExecutableSourceLabel(status.ffmpegSource),
        },
        {
          id: "model",
          label: "模型文件",
          installed: status.modelInstalled,
          detail: status.modelInstalled
            ? `${status.modelName} · ${status.modelSize}`
            : "模型仍需单独下载，本页下方保留独立下载按钮",
          stateLabel: status.modelInstalled ? "已下载" : "缺失",
        },
      ]
    : [];

  return (
    <section
      aria-hidden={!visible}
      className={cn("space-y-6", !visible && "hidden")}
    >
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Whisper 设置</h3>
        <p className="text-sm text-muted-foreground">
          连接本机 helper，读取当前电脑上的 Whisper/ffmpeg/模型配置。
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border/60 bg-card/70 py-14">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          {error && (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm shadow-primary/5">
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">本机 helper</span>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 rounded-full",
                      helperConnected ? "bg-green-500" : "bg-red-500"
                    )}
                  />
                  <span className="text-sm text-muted-foreground">
                    {helperConnected ? `已连接 · ${platformLabel}` : "未连接"}
                  </span>
                </div>
              </div>

              {!helperConnected && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    需要先在当前电脑上启动本机 helper，设置页才能检测和安装本地转录依赖。
                  </p>
                  <div className="rounded-xl bg-muted/60 px-3 py-3 text-xs text-muted-foreground">
                    在用户电脑本机运行：<code>npm run helper</code>
                  </div>
                </div>
              )}

              <div className="space-y-3 border-t border-border/50 pt-4">
                <div>
                  <h4 className="text-sm font-medium">本地转录环境清单</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    本地转录优先复用你电脑上已有的组件。缺失时可一键安装 `Homebrew`、
                    `whisper.cpp` 与 `ffmpeg`，模型仍单独下载。
                  </p>
                </div>

                <div className="grid gap-3">
                  {runtimeChecklist.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-4 rounded-2xl border border-border/60 bg-background/70 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{item.label}</div>
                        <div className="mt-1 break-all text-xs text-muted-foreground">{item.detail}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className={cn(
                            "h-2.5 w-2.5 rounded-full",
                            item.installed ? "bg-green-500" : "bg-red-500"
                          )}
                        />
                        <span className="text-xs text-muted-foreground">{item.stateLabel}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {status?.isLegacyPayload && (
                  <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                    <p className="text-sm font-medium">检测信息来自旧版 helper</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      当前 helper 仍使用旧状态结构，Whisper / ffmpeg 是否可用会继续按实际结果判断；
                      如果想看到更完整的 Homebrew 与来源信息，重启 helper 后再打开此页面即可。
                    </p>
                  </div>
                )}

                {!!status?.missingRequirements?.length && (
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                    <p className="text-sm font-medium text-foreground">当前本地转录环境未完成</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      缺失项：
                      {status.missingRequirements
                        .map((item) => REQUIREMENT_LABELS[item] || item)
                        .join("、")}
                      。补齐后即可使用本地 Whisper 转录。
                    </p>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <Button
                        type="button"
                        onClick={handleInstallRuntime}
                        disabled={!helperConnected || !status.autoInstallSupported || !installComponents.length || installingRuntime}
                      >
                        {installingRuntime ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            正在安装组件...
                          </>
                        ) : (
                          "一键安装所需组件"
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowManualCommands((prev) => !prev)}
                      >
                        {showManualCommands ? "隐藏手动安装命令" : "查看手动安装命令"}
                      </Button>
                    </div>
                  </div>
                )}

                {showManualCommands && (
                  <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                    <p className="text-sm font-medium">手动安装命令</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      如果一键安装失败，可在系统终端依次运行以下命令。
                    </p>
                    <pre className="mt-3 overflow-x-auto rounded-xl bg-card px-3 py-3 text-xs text-muted-foreground">
                      <code>{MANUAL_INSTALL_COMMANDS}</code>
                    </pre>
                  </div>
                )}

                {installProgress && installProgress.status !== "idle" && (
                  <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">一键安装进度</p>
                        <p className="mt-1 text-xs text-muted-foreground">{installProgress.message}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{installProgress.progress}%</span>
                    </div>
                    <Progress value={installProgress.progress} max={100} className="mt-3" />
                    {!!installProgress.logsTail.length && (
                      <pre className="mt-3 max-h-48 overflow-y-auto rounded-xl bg-card px-3 py-3 text-xs text-muted-foreground">
                        <code>{installProgress.logsTail.join("\n")}</code>
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm shadow-primary/5">
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium">选择模型</h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Small 更快，Medium 识别质量更高。
                </p>
              </div>

              <div className="grid gap-3">
                {MODEL_OPTIONS.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => handleModelSelect(model.id)}
                    className={cn(
                      "relative flex items-center justify-between rounded-2xl border p-4 text-left transition-all",
                      selectedModel === model.id
                        ? "border-primary bg-primary/8 shadow-sm shadow-primary/10"
                        : "border-border/60 bg-background/80 hover:border-primary/35 hover:bg-accent/20"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2",
                          selectedModel === model.id
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/30"
                        )}
                      >
                        {selectedModel === model.id && <Check className="h-2.5 w-2.5" />}
                      </div>
                      <div>
                        <div className="font-medium">{model.name}</div>
                        <div className="text-xs text-muted-foreground">{model.description}</div>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">{model.size}</div>
                  </button>
                ))}
              </div>

              <div className="space-y-3 pt-2">
                {downloading && downloadProgress ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        正在下载 {downloadProgress.modelName} 模型...
                      </span>
                      <span className="font-medium">{downloadProgress.percent?.toFixed(1)}%</span>
                    </div>
                    <Progress value={downloadProgress.percent || 0} max={100} />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{formatFileSize(downloadProgress.downloaded)}</span>
                      <span>{formatFileSize(downloadProgress.total)}</span>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={handleDownload}
                    disabled={isBusy || !helperConnected}
                    className="w-full sm:w-auto"
                    variant={modelExists && status?.whisperInstalled ? "outline" : "default"}
                  >
                    {getDownloadButtonContent()}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm shadow-primary/5">
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex w-full items-center justify-between rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-sm font-medium transition-colors hover:bg-accent/20"
              >
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <span>高级设置</span>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform",
                    showAdvanced && "rotate-180"
                  )}
                />
              </button>

              {showAdvanced && (
                <div className="grid gap-4 rounded-2xl border border-border/60 bg-background/70 p-4">
                  <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      建议填写用户电脑上的绝对路径；Windows 与 macOS 都可手动配置。
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleResetProjectPaths}
                      disabled={isBusy}
                      className="w-full sm:w-auto"
                    >
                      使用当前项目默认目录
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium">转录文件目录</label>
                    <Input
                      value={config.outputDir}
                      onChange={(e) => handleConfigChange("outputDir", e.target.value)}
                      placeholder="/Users/you/Documents/MemoFlow Transcripts"
                      disabled={!helperConnected}
                    />
                    <p className="text-xs text-muted-foreground">
                      转录完成后，文件将保存到这个本机目录下，并按播客标题创建子目录。
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium">whisper.cpp 路径</label>
                    <Input
                      value={config.whisperPath}
                      onChange={(e) => handleConfigChange("whisperPath", e.target.value)}
                      placeholder={status?.platform === "win32" ? "C:\\whisper\\whisper-cli.exe" : "/usr/local/bin/whisper-cli"}
                      disabled={!helperConnected}
                    />
                    <p className="text-xs text-muted-foreground">
                      支持绝对路径，或已经加入系统 PATH 的命令名。
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium">模型文件路径</label>
                    <Input
                      value={config.modelPath}
                      onChange={(e) => handleConfigChange("modelPath", e.target.value)}
                      placeholder={`ggml-${selectedModel}.bin 的本机绝对路径`}
                      disabled={!helperConnected}
                    />
                    <p className="text-xs text-muted-foreground">
                      下载按钮会默认把模型放到 helper 管理目录，也可以手动改成本机其他路径。
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium">ffmpeg 路径</label>
                    <Input
                      value={config.ffmpegPath}
                      onChange={(e) => handleConfigChange("ffmpegPath", e.target.value)}
                      placeholder="ffmpeg"
                      disabled={!helperConnected}
                    />
                    <p className="text-xs text-muted-foreground">
                      支持绝对路径，或已加入 PATH 的 `ffmpeg` 命令。
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium">转录线程数</label>
                    <Input
                      type="number"
                      min={1}
                      max={8}
                      value={config.threads}
                      onChange={(e) => handleConfigChange("threads", parseInt(e.target.value, 10) || 1)}
                      disabled={!helperConnected}
                    />
                    <p className="text-xs text-muted-foreground">helper 会自动限制到 1-8 线程，默认建议不超过 8。</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-border/60 pt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose} disabled={saving || isBusy}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving || loading || !helperConnected}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  保存中...
                </>
              ) : (
                "保存 Whisper 配置"
              )}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── 转录引擎设置面板 ───

const ENGINE_OPTIONS: Array<{
  id: TranscriptionEngineType;
  name: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    id: "local-whisper",
    name: "本地 Whisper",
    description: "使用本地 whisper.cpp 进行转录，无需网络",
    icon: <Terminal className="h-4 w-4" />,
  },
  {
    id: "qwen-asr",
    name: "千问 ASR",
    description: "使用阿里云千问 ASR 在线转录，速度快",
    icon: <Globe className="h-4 w-4" />,
  },
];

function TranscriptionEnginePanel({ visible }: { visible: boolean }) {
  const { config, loaded, setActiveEngine, updateOnlineASRConfig } = useTranscriptionConfig();
  const [showApiKey, setShowApiKey] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ success: boolean; message: string } | null>(null);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const data = await helperRequest<{ success: boolean; message: string }>("/online-asr/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config.onlineASR),
      });
      setTestResult(data);
    } catch {
      setTestResult({ success: false, message: "连接测试失败" });
    } finally {
      setTesting(false);
    }
  };

  if (!loaded) {
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
        <h3 className="text-lg font-semibold">转录引擎</h3>
        <p className="text-sm text-muted-foreground">
          选择语音识别引擎。本地 Whisper 无需网络但需要安装环境，在线模型只需 API Key。
        </p>
      </div>

      {/* 引擎切换 */}
      <div className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm shadow-primary/5">
        <div className="space-y-4">
          <h4 className="text-sm font-medium">选择引擎</h4>
          <div className="grid gap-3">
            {ENGINE_OPTIONS.map((engineOpt) => {
              const selected = config.activeEngine === engineOpt.id;
              return (
                <button
                  key={engineOpt.id}
                  type="button"
                  onClick={() => setActiveEngine(engineOpt.id)}
                  className={cn(
                    "relative flex items-center justify-between rounded-2xl border p-4 text-left transition-all",
                    selected
                      ? "border-primary bg-primary/8 shadow-sm shadow-primary/10"
                      : "border-border/60 bg-background/80 hover:border-primary/35 hover:bg-accent/20"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border",
                        selected
                          ? "border-primary/30 bg-primary/12 text-primary"
                          : "border-border/60 bg-card text-muted-foreground"
                      )}
                    >
                      {engineOpt.icon}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{engineOpt.name}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{engineOpt.description}</div>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors",
                      selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
                    )}
                  >
                    {selected && <Check className="h-3 w-3" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 千问 ASR 配置 */}
      {config.activeEngine === "qwen-asr" && (
        <div className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm shadow-primary/5">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-medium">千问 ASR 配置</h4>
            </div>

            {/* API Key */}
            <div className="space-y-2">
              <label className="text-xs font-medium">API Key</label>
              <div className="relative">
                <Input
                  type={showApiKey ? "text" : "password"}
                  value={config.onlineASR.apiKey}
                  onChange={(e) => updateOnlineASRConfig({ apiKey: e.target.value })}
                  placeholder="sk-..."
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                在 <a href="https://bailian.console.aliyun.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">阿里云百炼控制台</a> 获取 DashScope API Key。
              </p>
            </div>

            {/* 模型选择 */}
            <div className="space-y-2">
              <label className="text-xs font-medium">模型</label>
              <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/70 px-3 py-2.5">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Qwen3-ASR-Flash-Filetrans</span>
                <span className="ml-auto text-xs text-muted-foreground">长音频转写</span>
              </div>
              <p className="text-xs text-muted-foreground">
                默认使用适合播客场景的长音频异步模型；如果短音频识别失败，服务端也会自动回退到长音频接口。
              </p>
            </div>

            {/* 连接测试 */}
            <div className="flex items-center gap-3 border-t border-border/50 pt-4">
              <Button
                size="sm"
                variant="outline"
                onClick={handleTestConnection}
                disabled={testing || !config.onlineASR.apiKey}
              >
                {testing ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    测试中...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-3.5 w-3.5" />
                    测试连接
                  </>
                )}
              </Button>
              {testResult && (
                <span
                  className={cn(
                    "text-xs",
                    testResult.success ? "text-green-600 dark:text-green-400" : "text-destructive"
                  )}
                >
                  {testResult.message}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 引擎状态 */}
      <div className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm shadow-primary/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">当前引擎</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                config.activeEngine === "qwen-asr" && config.onlineASR.apiKey
                  ? "bg-green-500"
                  : config.activeEngine === "local-whisper"
                    ? "bg-green-500"
                    : "bg-amber-500"
              )}
            />
            <span className="text-sm text-muted-foreground">
              {config.activeEngine === "qwen-asr"
                ? config.onlineASR.apiKey
                  ? "千问 ASR · 已配置"
                  : "千问 ASR · 未配置 API Key"
                : "本地 Whisper"}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function AppSettingsDialog({ open, onOpenChange, initialSection = "general" }: WhisperSettingsProps) {
  const [activeSection, setActiveSection] = React.useState<SettingsSection>("general");

  React.useEffect(() => {
    if (open) {
      setActiveSection(initialSection);
    }
  }, [initialSection, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-5xl gap-0 overflow-hidden p-0 sm:rounded-[1.5rem]">
        <DialogHeader className="border-b border-border/60 px-6 py-5">
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>管理应用偏好、语言模型和语音转录环境。</DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[78vh] min-h-[560px] grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="border-b border-border/60 bg-muted/20 p-3 md:border-b-0 md:border-r">
            <nav className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
              {SETTINGS_SECTIONS.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    "flex min-w-[160px] items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-all md:min-w-0",
                    activeSection === section.id
                      ? "border-primary/30 bg-background shadow-sm shadow-primary/10"
                      : "border-transparent text-muted-foreground hover:border-border/60 hover:bg-background/70 hover:text-foreground"
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                      activeSection === section.id
                        ? "bg-primary/12 text-primary"
                        : "bg-background/80 text-muted-foreground"
                    )}
                  >
                    {section.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{section.label}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{section.description}</div>
                  </div>
                </button>
              ))}
            </nav>
          </aside>

          <div className="min-h-0 overflow-y-auto bg-background px-4 py-5 sm:px-6 sm:py-6">
            <GeneralSettingsPanel visible={activeSection === "general"} />
            <LanguageModelSettingsPanel visible={activeSection === "language-models"} />
            <TranscriptionEnginePanel visible={activeSection === "transcription"} />
            <WhisperPanel
              open={open}
              visible={activeSection === "whisper"}
              onClose={() => onOpenChange(false)}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const WhisperSettings = AppSettingsDialog;
