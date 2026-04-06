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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { WhisperConfig, WhisperStatus, TranscriptionEngineType } from "@/types";
import { useTranscriptionConfig } from "@/hooks/use-transcription-config";

interface WhisperSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SettingsSection = "general" | "transcription" | "whisper";

interface DownloadProgress {
  status: "idle" | "downloading" | "completed" | "error";
  downloaded: number;
  total: number;
  modelName: string;
  percent?: number;
  error?: string;
}

interface InstallProgress {
  status: "idle" | "cloning" | "compiling" | "completed" | "error";
  step: string;
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
  const { config: appConfig, updateWhisperConfig } = useTranscriptionConfig();
  const [status, setStatus] = React.useState<WhisperStatus | null>(null);
  const [config, setConfig] = React.useState<WhisperConfig>(appConfig.whisper);
  const [selectedModel, setSelectedModel] = React.useState<"small" | "medium">(appConfig.whisper.modelName as "small" | "medium");
  const [downloading, setDownloading] = React.useState(false);
  const [downloadProgress, setDownloadProgress] = React.useState<DownloadProgress | null>(null);
  const [installing, setInstalling] = React.useState(false);
  const [installProgress, setInstallProgress] = React.useState<InstallProgress | null>(null);
  const [ffmpegInstalling, setFfmpegInstalling] = React.useState(false);
  const [ffmpegInstallProgress, setFfmpegInstallProgress] = React.useState<InstallProgress | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingModelDownload, setPendingModelDownload] = React.useState(false);

  const downloadEsRef = React.useRef<EventSource | null>(null);
  const installEsRef = React.useRef<EventSource | null>(null);
  const ffmpegEsRef = React.useRef<EventSource | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const statusRes = await fetch("/api/whisper-status");
      const statusData = await statusRes.json();

      if (statusData.success) {
        setStatus(statusData.data);
        if (statusData.data.whisperInstalled) {
          setInstalling(false);
        }
        if (statusData.data.ffmpegInstalled) {
          setFfmpegInstalling(false);
        }
      }

      // 从 localStorage 中同步配置状态
      if (appConfig?.whisper) {
        setConfig(appConfig.whisper);
        setSelectedModel(appConfig.whisper.modelName as "small" | "medium");
      }
    } catch (err) {
      setError("加载环境状态失败，请重试");
      console.error("加载状态失败:", err);
    } finally {
      setLoading(false);
    }
  }, [appConfig]);

  React.useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, loadData]);

  React.useEffect(() => {
    return () => {
      downloadEsRef.current?.close();
      installEsRef.current?.close();
      ffmpegEsRef.current?.close();
    };
  }, []);

  const startDownloadTracking = React.useCallback(() => {
    downloadEsRef.current?.close();

    const es = new EventSource("/api/whisper-download-progress");
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
      es.close();
      downloadEsRef.current = null;
    };
  }, [loadData]);

  const startInstallTracking = React.useCallback(() => {
    installEsRef.current?.close();

    const es = new EventSource("/api/whisper-install-progress");
    installEsRef.current = es;

    let idleCount = 0;

    es.onmessage = (event) => {
      try {
        const data: InstallProgress = JSON.parse(event.data);
        setInstallProgress(data);

        if (data.status === "completed") {
          setInstalling(false);
          es.close();
          installEsRef.current = null;
          loadData();
        } else if (data.status === "error") {
          setInstalling(false);
          setPendingModelDownload(false);
          setError(data.error || "安装失败");
          es.close();
          installEsRef.current = null;
        } else if (data.status === "idle") {
          idleCount++;
          if (idleCount >= 3) {
            setInstalling(false);
            es.close();
            installEsRef.current = null;
            loadData();
          }
        }
      } catch (err) {
        console.error("解析安装进度失败:", err);
      }
    };

    es.onerror = () => {
      es.close();
      installEsRef.current = null;
    };
  }, [loadData]);

  const startFfmpegInstallTracking = React.useCallback(() => {
    ffmpegEsRef.current?.close();

    const es = new EventSource("/api/ffmpeg-install-progress");
    ffmpegEsRef.current = es;

    es.onmessage = (event) => {
      try {
        const data: InstallProgress = JSON.parse(event.data);
        setFfmpegInstallProgress(data);

        if (data.status === "completed") {
          setFfmpegInstalling(false);
          es.close();
          ffmpegEsRef.current = null;
          loadData();
        } else if (data.status === "error") {
          setFfmpegInstalling(false);
          setError(data.error || "ffmpeg 安装失败");
          es.close();
          ffmpegEsRef.current = null;
        }
      } catch (err) {
        console.error("解析 ffmpeg 安装进度失败:", err);
      }
    };

    es.onerror = () => {
      setFfmpegInstalling(false);
      es.close();
      ffmpegEsRef.current = null;
    };
  }, [loadData]);

  React.useEffect(() => {
    if (pendingModelDownload && !installing && installProgress?.status === "completed") {
      setPendingModelDownload(false);
      void handleDownloadModel();
    }
  }, [installProgress, installing, pendingModelDownload]);

  const handleInstallWhisper = async () => {
    setError(null);
    setInstalling(true);
    setInstallProgress(null);

    try {
      const res = await fetch("/api/whisper-install", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "启动安装失败");
      }

      if (data.alreadyInstalled) {
        setInstalling(false);
        loadData();
        return;
      }

      startInstallTracking();

      setTimeout(() => {
        loadData();
      }, 3000);

      const safetyTimeout = setTimeout(() => {
        setInstalling(false);
      }, 60000);

      const cleanup = () => clearTimeout(safetyTimeout);
      return cleanup;

    } catch (err) {
      setInstalling(false);
      setError(err instanceof Error ? err.message : "启动安装失败");
    }
  };

  const handleInstallFfmpeg = async () => {
    setError(null);
    setFfmpegInstalling(true);
    setFfmpegInstallProgress(null);

    try {
      const res = await fetch("/api/ffmpeg-install", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "启动 ffmpeg 安装失败");
      }

      if (data.alreadyInstalled) {
        setFfmpegInstalling(false);
        loadData();
        return;
      }

      startFfmpegInstallTracking();
    } catch (err) {
      setFfmpegInstalling(false);
      setError(err instanceof Error ? err.message : "启动 ffmpeg 安装失败");
    }
  };

  const handleDownloadModel = async () => {
    setError(null);
    setDownloading(true);
    setDownloadProgress(null);

    try {
      const res = await fetch("/api/whisper-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelName: selectedModel }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.alreadyExists) {
          loadData();
          setDownloading(false);
          return;
        }
        throw new Error(data.error || "启动下载失败");
      }

      startDownloadTracking();
    } catch (err) {
      setDownloading(false);
      setError(err instanceof Error ? err.message : "启动下载失败");
    }
  };

  const handleDownload = async () => {
    if (!status?.whisperInstalled) {
      setPendingModelDownload(true);
      await handleInstallWhisper();
    } else {
      await handleDownloadModel();
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // 延迟一点以显示加载效果
      await new Promise(resolve => setTimeout(resolve, 300));
      updateWhisperConfig(config);
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
    setConfig((prev) => ({
      ...prev,
      outputDir: "transcripts",
      whisperPath: "whisper.cpp/build/bin/whisper-cli",
      modelPath: `models/ggml-${selectedModel}.bin`,
      ffmpegPath: "ffmpeg",
    }));
  };

  const modelExists = status?.modelName === selectedModel && status?.modelInstalled;
  const isBusy = installing || downloading || saving || ffmpegInstalling;

  const getDownloadButtonContent = () => {
    if (installing) {
      return (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          正在安装 whisper.cpp...
        </>
      );
    }
    if (downloading) {
      return (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          下载中...
        </>
      );
    }
    if (!status?.whisperInstalled) {
      return (
        <>
          <Download className="mr-2 h-4 w-4" />
          安装 whisper.cpp 并下载模型
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

  return (
    <section
      aria-hidden={!visible}
      className={cn("space-y-6", !visible && "hidden")}
    >
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Whisper 设置</h3>
        <p className="text-sm text-muted-foreground">
          配置本地语音识别模型、安装 whisper.cpp 并管理转录参数。
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
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">whisper.cpp</span>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 rounded-full",
                      status?.whisperInstalled ? "bg-green-500" : "bg-red-500"
                    )}
                  />
                  <span className="text-sm text-muted-foreground">
                    {status?.whisperInstalled ? "已安装" : "未安装"}
                  </span>
                </div>
              </div>

              {!status?.whisperInstalled && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    需要先安装 whisper.cpp 才能进行语音转录（依赖 Git 与本地编译工具）。
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleInstallWhisper}
                    disabled={isBusy}
                    className="w-full sm:w-auto"
                  >
                    {installing ? (
                      <>
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        安装中...
                      </>
                    ) : (
                      <>
                        <Terminal className="mr-2 h-3.5 w-3.5" />
                        一键安装 whisper.cpp
                      </>
                    )}
                  </Button>
                </div>
              )}

              {installing && installProgress && (
                <div className="rounded-xl bg-muted/60 px-3 py-3">
                  <div className="flex items-center gap-2 text-xs">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span className="text-muted-foreground">{installProgress.step}</span>
                  </div>
                  {installProgress.status === "cloning" && (
                    <div className="mt-1 text-[10px] text-muted-foreground/70">
                      正在从 GitHub 克隆仓库...
                    </div>
                  )}
                  {installProgress.status === "compiling" && (
                    <div className="mt-1 text-[10px] text-muted-foreground/70">
                      编译可能需要几分钟，请耐心等待。
                    </div>
                  )}
                </div>
              )}

              <div className="border-t border-border/50 pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">ffmpeg</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        status?.ffmpegInstalled ? "bg-green-500" : "bg-red-500"
                      )}
                    />
                    <span className="text-sm text-muted-foreground">
                      {status?.ffmpegInstalled ? "已安装" : "未安装"}
                    </span>
                  </div>
                </div>
                {!status?.ffmpegInstalled && (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      需要安装 ffmpeg 才能进行音频格式转换。
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleInstallFfmpeg}
                      disabled={isBusy}
                      className="w-full sm:w-auto"
                    >
                      {ffmpegInstalling ? (
                        <>
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          安装中...
                        </>
                      ) : (
                        <>
                          <Terminal className="mr-2 h-3.5 w-3.5" />
                          安装 ffmpeg
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {ffmpegInstalling && ffmpegInstallProgress && (
                  <div className="mt-2 rounded-xl bg-muted/60 px-3 py-3">
                    <div className="flex items-center gap-2 text-xs">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span className="text-muted-foreground">{ffmpegInstallProgress.step}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-border/50 pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">模型文件</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        status?.modelInstalled ? "bg-green-500" : "bg-red-500"
                      )}
                    />
                    <span className="text-sm text-muted-foreground">
                      {status?.modelInstalled ? `已安装 (${status.modelSize})` : "未安装"}
                    </span>
                  </div>
                </div>
                {!status?.modelInstalled && (
                  <p className="mt-1 text-xs text-muted-foreground">请先在下方选择并下载模型。</p>
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
                {installing && pendingModelDownload && installProgress && (
                  <div className="rounded-xl bg-blue-50 px-3 py-3 text-xs text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
                    <span>Step 1/2: </span>
                    {installProgress.step}
                    <span className="mt-1 block text-[10px] text-blue-500 dark:text-blue-400">
                      安装完成后将自动开始下载模型。
                    </span>
                  </div>
                )}

                {downloading && downloadProgress ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {pendingModelDownload ||
                        (!status?.whisperInstalled && installProgress?.status === "completed")
                          ? "Step 2/2: "
                          : ""}
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
                    disabled={isBusy}
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
                      目录支持相对路径，相对于当前项目根目录解析。
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
                      placeholder="transcripts"
                    />
                    <p className="text-xs text-muted-foreground">
                      转录完成后，文件将保存到此目录下（以播客标题命名的子文件夹）。
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium">whisper.cpp 路径</label>
                    <Input
                      value={config.whisperPath}
                      onChange={(e) => handleConfigChange("whisperPath", e.target.value)}
                      placeholder="whisper.cpp/build/bin/whisper-cli"
                    />
                    <p className="text-xs text-muted-foreground">
                      推荐使用当前项目内的相对路径，便于迁移目录。
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium">模型文件路径</label>
                    <Input
                      value={config.modelPath}
                      onChange={(e) => handleConfigChange("modelPath", e.target.value)}
                      placeholder={`models/ggml-${selectedModel}.bin`}
                    />
                    <p className="text-xs text-muted-foreground">
                      模型建议放在项目内的 `models/` 目录。
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium">ffmpeg 路径</label>
                    <Input
                      value={config.ffmpegPath}
                      onChange={(e) => handleConfigChange("ffmpegPath", e.target.value)}
                      placeholder="ffmpeg"
                    />
                    <p className="text-xs text-muted-foreground">
                      用于转换音频格式（需 16kHz WAV）。
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium">转录线程数</label>
                    <Input
                      type="number"
                      min={1}
                      max={16}
                      value={config.threads}
                      onChange={(e) => handleConfigChange("threads", parseInt(e.target.value, 10) || 1)}
                    />
                    <p className="text-xs text-muted-foreground">建议设置为 CPU 核心数的一半。</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-border/60 pt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose} disabled={saving || isBusy}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving || loading}>
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
      // 直接在前端调用测试（通过代理避免 CORS）
      const res = await fetch("/api/test-asr-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config.onlineASR),
      });
      const data = await res.json();
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

export function WhisperSettings({ open, onOpenChange }: WhisperSettingsProps) {
  const [activeSection, setActiveSection] = React.useState<SettingsSection>("general");

  React.useEffect(() => {
    if (open) {
      setActiveSection("general");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-5xl gap-0 overflow-hidden p-0 sm:rounded-[1.5rem]">
        <DialogHeader className="border-b border-border/60 px-6 py-5">
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>管理应用偏好和语音转录环境。</DialogDescription>
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
