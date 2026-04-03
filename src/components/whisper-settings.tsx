"use client";

import * as React from "react";
import { Check, ChevronDown, Download, Loader2, Settings, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { WhisperConfig, WhisperStatus } from "@/types";

interface WhisperSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function WhisperSettings({ open, onOpenChange }: WhisperSettingsProps) {
  const [status, setStatus] = React.useState<WhisperStatus | null>(null);
  const [config, setConfig] = React.useState<WhisperConfig>({
    whisperPath: "",
    modelPath: "",
    modelName: "small",
    threads: 4,
    outputDir: "",
  });
  const [selectedModel, setSelectedModel] = React.useState<"small" | "medium">("small");
  const [downloading, setDownloading] = React.useState(false);
  const [downloadProgress, setDownloadProgress] = React.useState<DownloadProgress | null>(null);
  const [installing, setInstalling] = React.useState(false);
  const [installProgress, setInstallProgress] = React.useState<InstallProgress | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // When true, auto-download model after whisper install completes
  const [pendingModelDownload, setPendingModelDownload] = React.useState(false);

  const downloadEsRef = React.useRef<EventSource | null>(null);
  const installEsRef = React.useRef<EventSource | null>(null);

  // 加载状态和配置
  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, configRes] = await Promise.all([
        fetch("/api/whisper-status"),
        fetch("/api/whisper-config"),
      ]);

      const statusData = await statusRes.json();
      const configData = await configRes.json();

      if (statusData.success) {
        setStatus(statusData.data);
      }

      if (configData.success) {
        setConfig(configData.data);
        setSelectedModel(configData.data.modelName as "small" | "medium");
      }
    } catch (err) {
      setError("加载配置失败，请重试");
      console.error("加载配置失败:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 对话框打开时加载数据
  React.useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, loadData]);

  // 清理 EventSource
  React.useEffect(() => {
    return () => {
      downloadEsRef.current?.close();
      installEsRef.current?.close();
    };
  }, []);

  // 监听下载进度
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

  // 监听安装进度
  const startInstallTracking = React.useCallback(() => {
    installEsRef.current?.close();

    const es = new EventSource("/api/whisper-install-progress");
    installEsRef.current = es;

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

  // When install completes and pendingModelDownload is true, trigger model download
  React.useEffect(() => {
    if (
      pendingModelDownload &&
      !installing &&
      installProgress?.status === "completed"
    ) {
      setPendingModelDownload(false);
      handleDownloadModel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installing, installProgress, pendingModelDownload]);

  // 安装 whisper.cpp
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
    } catch (err) {
      setInstalling(false);
      setError(err instanceof Error ? err.message : "启动安装失败");
    }
  };

  // 下载模型（纯模型下载）
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

  // 下载按钮点击：如果 whisper 未安装，先安装再下载
  const handleDownload = async () => {
    if (!status?.whisperInstalled) {
      // whisper not installed: install first, then auto-download model
      setPendingModelDownload(true);
      await handleInstallWhisper();
    } else {
      await handleDownloadModel();
    }
  };

  // 保存配置
  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/whisper-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "保存配置失败");
      }

      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存配置失败");
    } finally {
      setSaving(false);
    }
  };

  // 处理模型选择
  const handleModelSelect = (modelId: "small" | "medium") => {
    setSelectedModel(modelId);
    setConfig((prev) => ({
      ...prev,
      modelName: modelId,
      modelPath: prev.modelPath.replace(/ggml-\w+\.bin$/, `ggml-${modelId}.bin`),
    }));
  };

  // 处理配置字段变更
  const handleConfigChange = (field: keyof WhisperConfig, value: string | number) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const modelExists = status?.modelName === selectedModel && status?.modelInstalled;
  const isBusy = installing || downloading;

  // Determine the download button label
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
    if (!status?.whisperInstalled && !modelExists) {
      return (
        <>
          <Download className="mr-2 h-4 w-4" />
          安装 whisper.cpp 并下载模型
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Whisper 设置</DialogTitle>
          <DialogDescription>配置本地语音识别模型</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* 错误提示 */}
            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* 状态概览 */}
            <div className="rounded-lg border border-border/40 bg-card/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">whisper.cpp</span>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
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
                    需要安装 whisper.cpp 才能进行语音转录（需要 Git 和编译工具）
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleInstallWhisper}
                    disabled={isBusy}
                    className="w-full"
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

              {/* whisper.cpp 安装进度 */}
              {installing && installProgress && (
                <div className="rounded-md bg-muted/50 px-3 py-2 space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span className="text-muted-foreground">{installProgress.step}</span>
                  </div>
                  {installProgress.status === "cloning" && (
                    <div className="text-[10px] text-muted-foreground/60">
                      正在从 GitHub 克隆仓库...
                    </div>
                  )}
                  {installProgress.status === "compiling" && (
                    <div className="text-[10px] text-muted-foreground/60">
                      编译可能需要几分钟，请耐心等待
                    </div>
                  )}
                </div>
              )}

              <div className="border-t border-border/40 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">模型文件</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        status?.modelInstalled ? "bg-green-500" : "bg-red-500"
                      )}
                    />
                    <span className="text-sm text-muted-foreground">
                      {status?.modelInstalled
                        ? `已安装 (${status.modelSize})`
                        : "未安装"}
                    </span>
                  </div>
                </div>
                {!status?.modelInstalled && (
                  <p className="text-xs text-muted-foreground mt-1">
                    请在下方选择并下载模型
                  </p>
                )}
              </div>
            </div>

            {/* 模型选择 */}
            <div className="space-y-3">
              <label className="text-sm font-medium">选择模型</label>
              <div className="grid gap-3">
                {MODEL_OPTIONS.map((model) => (
                  <div
                    key={model.id}
                    onClick={() => handleModelSelect(model.id)}
                    className={cn(
                      "relative flex cursor-pointer items-center justify-between rounded-lg border p-4 transition-all hover:border-primary/50",
                      selectedModel === model.id
                        ? "border-primary ring-2 ring-primary/20"
                        : "border-border/40"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center",
                          selectedModel === model.id
                            ? "border-primary bg-primary"
                            : "border-muted-foreground/30"
                        )}
                      >
                        {selectedModel === model.id && (
                          <Check className="h-2.5 w-2.5 text-primary-foreground" />
                        )}
                      </div>
                      <div>
                        <div className="font-medium">{model.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {model.description}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">{model.size}</div>
                  </div>
                ))}
              </div>

              {/* 下载按钮和进度 */}
              <div className="pt-2 space-y-3">
                {/* whisper 安装进度（在下载区域也显示） */}
                {installing && pendingModelDownload && installProgress && (
                  <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                    <span>Step 1/2: </span>
                    {installProgress.step}
                    <span className="block text-[10px] text-blue-500 dark:text-blue-400 mt-0.5">
                      安装完成后将自动开始下载模型
                    </span>
                  </div>
                )}

                {/* 模型下载进度 */}
                {downloading && downloadProgress ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {pendingModelDownload || (!status?.whisperInstalled && installProgress?.status === "completed")
                          ? "Step 2/2: "
                          : ""}
                        正在下载 {downloadProgress.modelName} 模型...
                      </span>
                      <span className="font-medium">
                        {downloadProgress.percent?.toFixed(1)}%
                      </span>
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
                    className="w-full"
                    variant={modelExists && status?.whisperInstalled ? "outline" : "default"}
                  >
                    {getDownloadButtonContent()}
                  </Button>
                )}
              </div>
            </div>

            {/* 高级设置 */}
            <div className="space-y-3">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex w-full items-center justify-between rounded-lg border border-border/40 p-3 text-sm font-medium transition-colors hover:bg-accent/50"
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
                <div className="space-y-4 rounded-lg border border-border/40 bg-card/30 p-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium">转录文件目录</label>
                    <Input
                      value={config.outputDir}
                      onChange={(e) => handleConfigChange("outputDir", e.target.value)}
                      placeholder="~/Documents/memo-flow-transcripts"
                    />
                    <p className="text-xs text-muted-foreground">
                      转录完成后，文件将保存到此目录下（以播客标题命名的子文件夹）
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium">whisper.cpp 路径</label>
                    <Input
                      value={config.whisperPath}
                      onChange={(e) => handleConfigChange("whisperPath", e.target.value)}
                      placeholder="/path/to/whisper.cpp"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium">模型文件路径</label>
                    <Input
                      value={config.modelPath}
                      onChange={(e) => handleConfigChange("modelPath", e.target.value)}
                      placeholder="/path/to/model.bin"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium">转录线程数</label>
                    <Input
                      type="number"
                      min={1}
                      max={16}
                      value={config.threads}
                      onChange={(e) =>
                        handleConfigChange("threads", parseInt(e.target.value) || 1)
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      建议设置为 CPU 核心数的一半
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving || isBusy}
          >
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                保存中...
              </>
            ) : (
              "保存"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
