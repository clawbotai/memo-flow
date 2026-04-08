'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FlowLoader } from "@/components/ui/flow-loader";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToastManager } from "@/components/ui/toast";
import { useTranscriptionConfig } from "@/hooks/use-transcription-config";
import {
  createHelperEventSource,
  helperRequest,
  isHelperUnavailableError,
} from "@/lib/local-helper-client";
import { normalizeWhisperStatus } from "@/lib/whisper-status";
import {
  mergeCachedTranscriptionHistory,
  readCachedTranscriptionHistory,
  removeCachedTranscriptionRecord,
  upsertCachedTranscriptionRecord,
} from "@/lib/transcription-browser-cache";
import type { TranscribeSegment, WhisperStatus } from "@/types";
import type { DesktopShellContext } from "@desktop/components/DesktopAppShell";
import type { TranscriptionRecord } from "@/types/transcription-history";
import { DesktopTranscriptionCard } from "@desktop/components/DesktopTranscriptionCard";
import { PageScene } from "@desktop/components/PageScene";

type PodcastAudioInfo = {
  audioUrl: string;
  wordCount: number;
  language: string;
};

const STATUS_STAGE_MAP: Record<string, string> = {
  idle: "准备中...",
  fetching_info: "正在获取播客信息...",
  downloading_audio: "正在下载音频文件...",
  converting: "正在转换音频格式...",
  transcribing: "正在转录中...",
  completed: "转录完成",
  error: "转录失败",
};

const LOCAL_RUNTIME_REQUIREMENT_LABELS: Record<string, string> = {
  homebrew: "Homebrew",
  whisper: "whisper.cpp",
  ffmpeg: "ffmpeg",
  model: "模型文件",
};

export function DesktopPodcastPage() {
  const { config } = useTranscriptionConfig();
  const { openSettings } = useOutletContext<DesktopShellContext>();
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
    duration?: number;
  } | null>(null);
  const [podcastUrl, setPodcastUrl] = useState("");
  const [podcastTranscript, setPodcastTranscript] = useState("");
  const [podcastAudioInfo, setPodcastAudioInfo] = useState<PodcastAudioInfo | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [transcribeStage, setTranscribeStage] = useState("");
  const [transcribeStatus, setTranscribeStatus] = useState("");
  const [liveSegments, setLiveSegments] = useState<TranscribeSegment[]>([]);
  const [transcribeProgress, setTranscribeProgress] = useState<number | null>(null);
  const [episodeTitle, setEpisodeTitle] = useState("");
  const [savedPath, setSavedPath] = useState("");
  const [finalSegments, setFinalSegments] = useState<TranscribeSegment[]>([]);
  const [transcriptionHistory, setTranscriptionHistory] = useState<TranscriptionRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const transcribeEsRef = useRef<EventSource | null>(null);
  const transcribeReconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTaskIdRef = useRef<string | null>(null);
  const transcribeFinishedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isLoading = taskId !== null;

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const result = await helperRequest<{
          success: boolean;
          data: TranscriptionRecord[];
          error?: string;
        }>("/transcriptions");

        if (result.success) {
          setTranscriptionHistory(mergeCachedTranscriptionHistory(result.data));
        } else {
          console.error("加载转录历史失败:", result.error);
          setTranscriptionHistory(readCachedTranscriptionHistory());
        }
      } catch (error) {
        console.error("获取转录历史失败:", error);
        setTranscriptionHistory(readCachedTranscriptionHistory());
      } finally {
        setHistoryLoading(false);
      }
    };

    loadHistory();
    const interval = setInterval(loadHistory, 5000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (taskId && !isLoading) {
      const refreshHistory = async () => {
        try {
          const result = await helperRequest<{
            success: boolean;
            data: TranscriptionRecord[];
            error?: string;
          }>("/transcriptions");

          if (result.success) {
            setTranscriptionHistory(mergeCachedTranscriptionHistory(result.data));
          } else {
            setTranscriptionHistory(readCachedTranscriptionHistory());
          }
        } catch (error) {
          console.error("刷新转录历史失败:", error);
          setTranscriptionHistory(readCachedTranscriptionHistory());
        }
      };

      refreshHistory();
    }
  }, [isLoading]);

  useEffect(() => {
    if (scrollRef.current && liveSegments.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [liveSegments]);

  const clearReconnectTimer = useCallback(() => {
    if (transcribeReconnectTimeoutRef.current) {
      clearTimeout(transcribeReconnectTimeoutRef.current);
      transcribeReconnectTimeoutRef.current = null;
    }
  }, []);

  const closeEventSource = useCallback(() => {
    clearReconnectTimer();
    transcribeEsRef.current?.close();
    transcribeEsRef.current = null;
  }, [clearReconnectTimer]);

  const resetActiveTaskState = useCallback(() => {
    transcribeFinishedRef.current = true;
    activeTaskIdRef.current = null;
    closeEventSource();
    setTaskId(null);
    setPodcastTranscript("");
    setPodcastAudioInfo(null);
    setLiveSegments([]);
    setTranscribeProgress(null);
    setTranscribeStage("");
    setTranscribeStatus("");
    setEpisodeTitle("");
    setSavedPath("");
    setFinalSegments([]);
  }, [closeEventSource]);

  const connectToTranscribeProgress = useCallback(
    (currentTaskId: string) => {
      clearReconnectTimer();
      transcribeEsRef.current?.close();

      const es = createHelperEventSource(`/transcriptions/${currentTaskId}/live`);
      transcribeEsRef.current = es;

      es.onopen = () => {
        clearReconnectTimer();
      };

      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as {
            success: boolean;
            data?: TranscriptionRecord;
          };

          if (activeTaskIdRef.current !== currentTaskId) {
            return;
          }

          if (!payload.success || !payload.data) {
            return;
          }

          const data = payload.data;
          setTranscribeStage(STATUS_STAGE_MAP[data.status] || "处理中...");
          setTranscribeStatus(data.status);
          setEpisodeTitle(data.title || "");

          if (data.segments && data.segments.length > 0) {
            setLiveSegments(data.segments);
          }

          if (data.progress !== undefined && data.progress !== null) {
            setTranscribeProgress(data.progress);
          }

          if (data.audioUrl) {
            const audioUrl = data.audioUrl;
            setPodcastAudioInfo(
              (prev) =>
                prev ?? {
                  audioUrl,
                  wordCount: data.wordCount || 0,
                  language: data.language || "zh",
                },
            );
          }

          const cachedRecord = upsertCachedTranscriptionRecord({
            id: currentTaskId,
            taskId: currentTaskId,
            title: data.title || episodeTitle || "未知标题",
            status: data.status,
            progress: data.progress ?? null,
            segments: data.segments || [],
            transcript: data.transcript,
            audioUrl: data.audioUrl,
            wordCount: data.wordCount,
            language: data.language,
            savedPath: data.savedPath,
            error: data.error,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          setTranscriptionHistory(cachedRecord);

          if (data.status === "completed") {
            transcribeFinishedRef.current = true;
            activeTaskIdRef.current = null;
            setPodcastTranscript(data.transcript || "");
            setPodcastAudioInfo((prev) => ({
              audioUrl: data.audioUrl ?? prev?.audioUrl ?? "",
              wordCount: data.wordCount || 0,
              language: data.language || "zh",
            }));
            setFinalSegments(data.segments || []);
            if (data.savedPath) {
              setSavedPath(data.savedPath);
            }
            setTaskId(null);
            setTranscribeProgress(null);
            closeEventSource();
            setToast({ message: "转录成功！", type: "success" });
          } else if (data.status === "error") {
            transcribeFinishedRef.current = true;
            activeTaskIdRef.current = null;
            setTaskId(null);
            setTranscribeProgress(null);
            closeEventSource();
            setToast({ message: data.error || "转录失败，请重试", type: "error" });
          }
        } catch (error) {
          console.error("解析转录进度数据失败:", error);
        }
      };

      es.onerror = () => {
        es.close();

        if (transcribeEsRef.current === es) {
          transcribeEsRef.current = null;
        }

        if (transcribeFinishedRef.current || activeTaskIdRef.current !== currentTaskId) {
          return;
        }

        clearReconnectTimer();
        transcribeReconnectTimeoutRef.current = setTimeout(() => {
          if (!transcribeFinishedRef.current && activeTaskIdRef.current === currentTaskId) {
            connectToTranscribeProgress(currentTaskId);
          }
        }, 3000);
      };
    },
    [clearReconnectTimer, closeEventSource, episodeTitle],
  );

  useEffect(() => {
    return () => {
      transcribeFinishedRef.current = true;
      activeTaskIdRef.current = null;
      closeEventSource();
    };
  }, [closeEventSource]);

  const buildLocalRuntimeGuidance = useCallback((status: WhisperStatus) => {
    const missingRequirements = status.missingRequirements.filter(
      (item) => item === "homebrew" || item === "whisper" || item === "ffmpeg" || item === "model",
    );
    const requirementText = missingRequirements
      .map((item) => LOCAL_RUNTIME_REQUIREMENT_LABELS[item] || item)
      .join("、");
    const needsBinaryInstall = missingRequirements.some(
      (item) => item === "homebrew" || item === "whisper" || item === "ffmpeg",
    );
    const needsModel = missingRequirements.includes("model");

    if (needsBinaryInstall && needsModel) {
      return `本地 Whisper 还缺少 ${requirementText}。已为你打开「Whisper 设置」；先安装所需组件，再下载模型后重新转录。`;
    }

    if (needsBinaryInstall) {
      return `本地 Whisper 还缺少 ${requirementText}。已为你打开「Whisper 设置」；可先点“一键安装所需组件”，或手动填写本机路径。`;
    }

    return `本地 Whisper 还缺少 ${requirementText}。已为你打开「Whisper 设置」；先下载模型后再重新转录。`;
  }, []);

  const loadLocalRuntimeStatus = useCallback(async () => {
    try {
      const result = await helperRequest<{
        success: boolean;
        data: WhisperStatus;
      }>("/whisper/status");

      if (result.success) {
        return normalizeWhisperStatus(result.data);
      }

      openSettings("whisper");
      setToast({
        message: "本地 Whisper 环境读取失败。已为你打开「Whisper 设置」，请检查 helper、可执行路径和模型配置后再重试。",
        type: "error",
        duration: 6000,
      });
      return null;
    } catch (error) {
      console.error("加载本地转录环境状态失败:", error);
      openSettings("whisper");
      setToast({
        message: isHelperUnavailableError(error)
          ? "未检测到本机 helper 服务。已为你打开「Whisper 设置」；请先在终端运行 npm run helper，再回来重新转录。"
          : "本地 Whisper 环境读取失败。已为你打开「Whisper 设置」，请检查 helper、可执行路径和模型配置后再重试。",
        type: "error",
        duration: 6000,
      });
      return null;
    }
  }, [openSettings]);

  const handlePodcastTranscribe = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!podcastUrl.trim() || isLoading) {
        return;
      }

      setPodcastTranscript("");
      setPodcastAudioInfo(null);
      setLiveSegments([]);
      setTranscribeProgress(null);
      setTranscribeStage("");
      setTranscribeStatus("");
      setEpisodeTitle("");
      setSavedPath("");
      setFinalSegments([]);
      transcribeFinishedRef.current = false;
      activeTaskIdRef.current = null;
      closeEventSource();

      try {
        if (!podcastUrl.includes("xiaoyuzhoufm.com")) {
          setToast({ message: "目前仅支持小宇宙播客链接", type: "error" });
          return;
        }

        if (config.activeEngine === "qwen-asr" && !config.onlineASR.apiKey.trim()) {
          openSettings("transcription");
          setToast({
            message: "当前使用的是千问 ASR。已为你打开「转录」设置；请先填写 API Key，再重新点击转录。",
            type: "error",
            duration: 6000,
          });
          return;
        }

        if (config.activeEngine === "local-whisper") {
          const runtimeStatus = await loadLocalRuntimeStatus();
          if (!runtimeStatus) {
            return;
          }

          const blockingRequirements = runtimeStatus.missingRequirements.filter(
            (item) => item === "homebrew" || item === "whisper" || item === "ffmpeg" || item === "model",
          );

          if (blockingRequirements.length) {
            openSettings("whisper");
            setToast({
              message: buildLocalRuntimeGuidance(runtimeStatus),
              type: "error",
              duration: 7000,
            });
            return;
          }
        }

        const result = await helperRequest<{
          success: boolean;
          data: { taskId: string };
          error?: string;
        }>("/transcriptions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: podcastUrl,
            engine: config.activeEngine,
            onlineASRConfig: config.onlineASR,
          }),
        });

        if (!result.success) {
          setToast({ message: result.error || "启动转录失败", type: "error" });
          return;
        }

        const newTaskId = result.data.taskId;
        transcribeFinishedRef.current = false;
        activeTaskIdRef.current = newTaskId;
        setTaskId(newTaskId);
        setTranscribeStage("准备中...");
        setTranscribeStatus("idle");
        setTranscriptionHistory(
          upsertCachedTranscriptionRecord({
            id: newTaskId,
            taskId: newTaskId,
            title: "未知标题",
            status: "idle",
            progress: 0,
            segments: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        );

        connectToTranscribeProgress(newTaskId);
      } catch (error) {
        console.error("Podcast transcription error:", error);
        if (isHelperUnavailableError(error)) {
          setToast({
            message: "未检测到本机 helper 服务，请先在电脑上启动 MemoFlow helper",
            type: "error",
          });
          transcribeFinishedRef.current = true;
          activeTaskIdRef.current = null;
          closeEventSource();
          setTaskId(null);
          return;
        }
        if (error instanceof Error) {
          setToast({ message: error.message, type: "error" });
        } else {
          setToast({ message: "网络错误，请检查连接", type: "error" });
        }
        transcribeFinishedRef.current = true;
        activeTaskIdRef.current = null;
        closeEventSource();
        setTaskId(null);
      }
    },
    [
      closeEventSource,
      config.activeEngine,
      buildLocalRuntimeGuidance,
      config.onlineASR,
      connectToTranscribeProgress,
      isLoading,
      loadLocalRuntimeStatus,
      podcastUrl,
    ],
  );

  const handleRecordDeleted = useCallback(
    (recordId: string) => {
      setTranscriptionHistory(removeCachedTranscriptionRecord(recordId));

      if (taskId === recordId || activeTaskIdRef.current === recordId) {
        resetActiveTaskState();
        setToast({ message: "转录任务已删除", type: "info" });
      }
    },
    [resetActiveTaskState, taskId],
  );

  const getButtonLabel = () => {
    if (!isLoading) {
      return "开始转录";
    }

    switch (transcribeStatus) {
      case "fetching_info":
        return "获取信息中...";
      case "downloading_audio":
        return "下载音频中...";
      case "converting":
        return "转换格式中...";
      case "transcribing":
        return "转录中...";
      default:
        return "处理中...";
    }
  };

  const renderSegmentRow = (segment: TranscribeSegment, index: number) => (
    <div
      key={index}
      className="flex items-baseline gap-6 border-b border-border/30 py-2.5 last:border-b-0"
    >
      <span className="w-12 shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
        {formatTimestamp(segment.timestamp)}
      </span>
      <span className="text-base leading-relaxed">{segment.text}</span>
    </div>
  );

  function formatTimestamp(ts: string): string {
    const match = ts.match(/\[(\d{2}):(\d{2}):(\d{2})/);
    if (!match) {
      return "00:00";
    }
    const hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    const seconds = Number.parseInt(match[3], 10);
    const totalMinutes = hours * 60 + minutes;
    return `${String(totalMinutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return (
    <PageScene>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">播客转录</h1>
          <p className="mt-1 text-muted-foreground">粘贴小宇宙播客链接，自动转录为文字</p>
        </div>

        {toast && (
          <ToastManager
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            onClose={() => setToast(null)}
          />
        )}

        <Card className="relative z-[1]">
          <CardHeader>
            <CardTitle>开始转录</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePodcastTranscribe} className="space-y-4">
              <div>
                <label htmlFor="podcast-url" className="mb-2 block text-sm font-medium">
                  小宇宙播客链接
                </label>
                <div className="flex gap-2">
                  <Input
                    id="podcast-url"
                    type="text"
                    placeholder="https://www.xiaoyuzhoufm.com/episode/..."
                    value={podcastUrl}
                    onChange={(e) => setPodcastUrl(e.target.value)}
                    className="flex-1"
                    disabled={isLoading}
                  />
                  <Button
                    type="submit"
                    className="bg-gradient-to-r from-primary to-primary-light transition-all hover:from-primary hover:to-primary-light"
                    disabled={isLoading || !podcastUrl.trim()}
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <FlowLoader size="sm" />
                        {getButtonLabel()}
                      </span>
                    ) : (
                      <span>开始转录</span>
                    )}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  输入小宇宙播客链接，自动提取音频并转录为文字。本地 Whisper 的安装、模型下载和路径配置都在「设置 → Whisper 设置」里完成。
                </p>
              </div>
            </form>

            {isLoading && (
              <div className="mt-6 space-y-4">
                <div className="flex items-center gap-3">
                  <FlowLoader size="sm" />
                  <div>
                    <span className="text-sm font-medium">{transcribeStage}</span>
                    {episodeTitle && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{episodeTitle}</p>
                    )}
                  </div>
                </div>

                {transcribeStatus === "transcribing" && transcribeProgress !== null && (
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                      <span>转录进度</span>
                      <span>{transcribeProgress}%</span>
                    </div>
                    <Progress value={transcribeProgress} />
                  </div>
                )}

                {liveSegments.length > 0 && (
                  <div
                    ref={scrollRef}
                    className="max-h-[500px] overflow-y-auto rounded-xl border border-border/40 bg-muted/20 px-4 py-2"
                  >
                    {liveSegments.map(renderSegmentRow)}
                  </div>
                )}
              </div>
            )}

            {!isLoading && (podcastTranscript || podcastAudioInfo) && (
              <div className="mt-6 space-y-6">
                {podcastAudioInfo && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>{episodeTitle || "音频信息"}</span>
                        <div className="flex gap-2">
                          <Badge variant="secondary">{podcastAudioInfo.language}</Badge>
                          <Badge variant="outline">{podcastAudioInfo.wordCount} 字</Badge>
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="rounded-xl bg-muted/30 p-4">
                          <audio controls className="w-full rounded-lg">
                            <source src={podcastAudioInfo.audioUrl} type="audio/mpeg" />
                            您的浏览器不支持音频元素。
                          </audio>
                        </div>
                        {savedPath && (
                          <p className="text-xs text-muted-foreground">文件已保存到: {savedPath}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {podcastTranscript && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>转录内容</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(podcastTranscript);
                            setToast({ message: "已复制到剪贴板", type: "success" });
                          }}
                        >
                          复制全文
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Tabs defaultValue="timestamped" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="timestamped">逐字稿</TabsTrigger>
                          <TabsTrigger value="plain">纯文本</TabsTrigger>
                        </TabsList>
                        <TabsContent value="timestamped" className="mt-4">
                          <div className="px-2">
                            {finalSegments.length > 0 ? (
                              finalSegments.map(renderSegmentRow)
                            ) : (
                              <div className="whitespace-pre-wrap text-base leading-relaxed">
                                {podcastTranscript}
                              </div>
                            )}
                          </div>
                        </TabsContent>
                        <TabsContent value="plain" className="mt-4">
                          <div className="whitespace-pre-wrap px-2 text-base leading-relaxed">
                            {podcastTranscript}
                          </div>
                        </TabsContent>
                      </Tabs>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>转录历史</CardTitle>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <div className="flex h-32 items-center justify-center">
                <FlowLoader size="md" />
              </div>
            ) : transcriptionHistory.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {transcriptionHistory.map((record) => (
                  <DesktopTranscriptionCard
                    key={record.id}
                    record={record}
                    onDeleted={handleRecordDeleted}
                  />
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-muted-foreground">暂无转录历史</p>
            )}
          </CardContent>
        </Card>
      </div>
    </PageScene>
  );
}
