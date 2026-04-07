'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FlowLoader } from '@/components/ui/flow-loader';
import { ToastManager } from '@/components/ui/toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import TranscriptionCard from '@/components/transcription-card';
import { TranscriptionRecord } from '@/types/transcription-history';
import type { TranscribeSegment } from '@/types';
import { useTranscriptionConfig } from '@/hooks/use-transcription-config';
import {
  createHelperEventSource,
  helperRequest,
  isHelperUnavailableError,
} from '@/lib/local-helper-client';
import {
  mergeCachedTranscriptionHistory,
  readCachedTranscriptionHistory,
  removeCachedTranscriptionRecord,
  upsertCachedTranscriptionRecord,
} from '@/lib/transcription-browser-cache';

type PodcastAudioInfo = {
  audioUrl: string;
  wordCount: number;
  language: string;
};

const STATUS_STAGE_MAP: Record<string, string> = {
  idle: '准备中...',
  fetching_info: '正在获取播客信息...',
  downloading_audio: '正在下载音频文件...',
  converting: '正在转换音频格式...',
  transcribing: '正在转录中...',
  completed: '转录完成',
  error: '转录失败',
};

export default function PodcastPage() {
  const { config } = useTranscriptionConfig();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // 播客转录相关状态
  const [podcastUrl, setPodcastUrl] = useState('');
  const [podcastTranscript, setPodcastTranscript] = useState('');
  const [podcastAudioInfo, setPodcastAudioInfo] = useState<PodcastAudioInfo | null>(null);

  // 实时转录状态
  const [taskId, setTaskId] = useState<string | null>(null);
  const [transcribeStage, setTranscribeStage] = useState('');
  const [transcribeStatus, setTranscribeStatus] = useState('');
  const [liveSegments, setLiveSegments] = useState<TranscribeSegment[]>([]);
  const [transcribeProgress, setTranscribeProgress] = useState<number | null>(null);
  const [episodeTitle, setEpisodeTitle] = useState('');
  const [savedPath, setSavedPath] = useState('');
  const [finalSegments, setFinalSegments] = useState<TranscribeSegment[]>([]);

  // 转录历史记录状态
  const [transcriptionHistory, setTranscriptionHistory] = useState<TranscriptionRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const transcribeEsRef = useRef<EventSource | null>(null);
  const transcribeReconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTaskIdRef = useRef<string | null>(null);
  const transcribeFinishedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isLoading = taskId !== null;

  // 加载转录历史记录
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const result = await helperRequest<{
          success: boolean;
          data: TranscriptionRecord[];
          error?: string;
        }>('/transcriptions');

        if (result.success) {
          setTranscriptionHistory(mergeCachedTranscriptionHistory(result.data));
        } else {
          console.error('加载转录历史失败:', result.error);
          setTranscriptionHistory(readCachedTranscriptionHistory());
        }
      } catch (error) {
        console.error('获取转录历史失败:', error);
        setTranscriptionHistory(readCachedTranscriptionHistory());
      } finally {
        setHistoryLoading(false);
      }
    };

    loadHistory();

    // 设置定时器定期刷新历史记录
    const interval = setInterval(loadHistory, 5000);

    return () => clearInterval(interval);
  }, []);

  // 添加新记录到历史记录列表
  useEffect(() => {
    if (taskId && !isLoading) {
      // 当前转录任务结束时，刷新历史记录
      const refreshHistory = async () => {
        try {
          const result = await helperRequest<{
            success: boolean;
            data: TranscriptionRecord[];
            error?: string;
          }>('/transcriptions');

          if (result.success) {
            setTranscriptionHistory(mergeCachedTranscriptionHistory(result.data));
          } else {
            setTranscriptionHistory(readCachedTranscriptionHistory());
          }
        } catch (error) {
          console.error('刷新转录历史失败:', error);
          setTranscriptionHistory(readCachedTranscriptionHistory());
        }
      };

      refreshHistory();
    }
  }, [isLoading]);

  // 自动滚动到底部
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
    setPodcastTranscript('');
    setPodcastAudioInfo(null);
    setLiveSegments([]);
    setTranscribeProgress(null);
    setTranscribeStage('');
    setTranscribeStatus('');
    setEpisodeTitle('');
    setSavedPath('');
    setFinalSegments([]);
  }, [closeEventSource]);

  const connectToTranscribeProgress = useCallback((currentTaskId: string) => {
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

        setTranscribeStage(STATUS_STAGE_MAP[data.status] || '处理中...');
        setTranscribeStatus(data.status);
        setEpisodeTitle(data.title || '');

        if (data.segments && data.segments.length > 0) {
          setLiveSegments(data.segments);
        }

        if (data.progress !== undefined && data.progress !== null) {
          setTranscribeProgress(data.progress);
        }

        if (data.audioUrl) {
          const audioUrl = data.audioUrl;
          setPodcastAudioInfo((prev) => prev ?? {
            audioUrl,
            wordCount: data.wordCount || 0,
            language: data.language || 'zh',
          });
        }

        const cachedRecord = upsertCachedTranscriptionRecord({
          id: currentTaskId,
          taskId: currentTaskId,
          title: data.title || episodeTitle || '未知标题',
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

        if (data.status === 'completed') {
          transcribeFinishedRef.current = true;
          activeTaskIdRef.current = null;
          setPodcastTranscript(data.transcript || '');
          setPodcastAudioInfo((prev) => ({
            audioUrl: data.audioUrl ?? prev?.audioUrl ?? '',
            wordCount: data.wordCount || 0,
            language: data.language || 'zh',
          }));
          setFinalSegments(data.segments || []);
          if (data.savedPath) {
            setSavedPath(data.savedPath);
          }
          setTaskId(null);
          setTranscribeProgress(null);
          closeEventSource();
          setToast({ message: '转录成功！', type: 'success' });
        } else if (data.status === 'error') {
          transcribeFinishedRef.current = true;
          activeTaskIdRef.current = null;
          setTaskId(null);
          setTranscribeProgress(null);
          closeEventSource();
          setToast({ message: data.error || '转录失败，请重试', type: 'error' });
        }
      } catch (err) {
        console.error('解析转录进度数据失败:', err);
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
  }, [clearReconnectTimer, closeEventSource]);

  // 清理 EventSource
  useEffect(() => {
    return () => {
      transcribeFinishedRef.current = true;
      activeTaskIdRef.current = null;
      closeEventSource();
    };
  }, [closeEventSource]);

  // 处理播客转录
  const handlePodcastTranscribe = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podcastUrl.trim() || isLoading) return;

    setPodcastTranscript('');
    setPodcastAudioInfo(null);
    setLiveSegments([]);
    setTranscribeProgress(null);
    setTranscribeStage('');
    setTranscribeStatus('');
    setEpisodeTitle('');
    setSavedPath('');
    setFinalSegments([]);
    transcribeFinishedRef.current = false;
    activeTaskIdRef.current = null;
    closeEventSource();

    try {
      // 检查是否为小宇宙链接
      if (!podcastUrl.includes('xiaoyuzhoufm.com')) {
        setToast({ message: '目前仅支持小宇宙播客链接', type: 'error' });
        return;
      }

      // 如果使用本地 Whisper 引擎，检查安装状态
      if (config.activeEngine === 'local-whisper') {
        const statusData = await helperRequest<{
          success: boolean;
          data: {
            whisperInstalled: boolean;
            modelInstalled: boolean;
          };
        }>('/whisper/status');

        if (statusData.success) {
          const { whisperInstalled, modelInstalled } = statusData.data;

          if (!whisperInstalled && !modelInstalled) {
            setToast({ message: '请点击左侧导航栏中的「设置」安装 whisper.cpp 并下载模型', type: 'error' });
            return;
          }

          if (!whisperInstalled) {
            setToast({ message: '请点击左侧导航栏中的「设置」安装 whisper.cpp', type: 'error' });
            return;
          }

          if (!modelInstalled) {
            setToast({ message: '请点击左侧导航栏中的「设置」下载语音识别模型', type: 'error' });
            return;
          }
        }
      }

      // 调用处理播客的API
      const result = await helperRequest<{
        success: boolean;
        data: { taskId: string };
        error?: string;
      }>('/transcriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          url: podcastUrl,
          engine: config.activeEngine,
          onlineASRConfig: config.onlineASR,
        }),
      });

      if (!result.success) {
        setToast({ message: result.error || '启动转录失败', type: 'error' });
        return;
      }

      const newTaskId = result.data.taskId;
      transcribeFinishedRef.current = false;
      activeTaskIdRef.current = newTaskId;
      setTaskId(newTaskId);
      setTranscribeStage('准备中...');
      setTranscribeStatus('idle');
      setTranscriptionHistory(upsertCachedTranscriptionRecord({
        id: newTaskId,
        taskId: newTaskId,
        title: '未知标题',
        status: 'idle',
        progress: 0,
        segments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      // 打开 SSE 连接监听转录进度
      connectToTranscribeProgress(newTaskId);
    } catch (error) {
      console.error('Podcast transcription error:', error);
      if (isHelperUnavailableError(error)) {
        setToast({ message: '未检测到本机 helper 服务，请先在电脑上启动 MemoFlow helper', type: 'error' });
      }
      transcribeFinishedRef.current = true;
      activeTaskIdRef.current = null;
      closeEventSource();
      setTaskId(null);
      setToast({ message: '网络错误，请检查连接', type: 'error' });
    }
  }, [closeEventSource, connectToTranscribeProgress, isLoading, podcastUrl]);

  const handleRecordDeleted = useCallback((recordId: string) => {
    setTranscriptionHistory(removeCachedTranscriptionRecord(recordId));

    if (taskId === recordId || activeTaskIdRef.current === recordId) {
      resetActiveTaskState();
      setToast({ message: '转录任务已删除', type: 'info' });
    }
  }, [resetActiveTaskState, taskId]);

  const getButtonLabel = () => {
    if (!isLoading) return '开始转录';
    switch (transcribeStatus) {
      case 'fetching_info': return '获取信息中...';
      case 'downloading_audio': return '下载音频中...';
      case 'converting': return '转换格式中...';
      case 'transcribing': return '转录中...';
      default: return '处理中...';
    }
  };

  // 渲染 segment 行
  const renderSegmentRow = (segment: TranscribeSegment, index: number) => (
    <div key={index} className="flex items-baseline gap-6 py-2.5 border-b border-border/30 last:border-b-0">
      <span className="text-sm text-muted-foreground font-mono tabular-nums shrink-0 w-12">
        {formatTimestamp(segment.timestamp)}
      </span>
      <span className="text-base leading-relaxed">
        {segment.text}
      </span>
    </div>
  );

  // 格式化时间戳的辅助函数
  function formatTimestamp(ts: string): string {
    const match = ts.match(/\[(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return '00:00';
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);
    const totalMinutes = hours * 60 + minutes;
    return `${String(totalMinutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return (
    <div className="min-h-full bg-background relative overflow-hidden">
      {/* Organic Background Elements */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        {/* Leaf/flower-like organic shapes */}
        <div className="absolute top-10 left-10 w-32 h-32 rounded-full bg-primary/10 blur-xl rotate-12"></div>
        <div className="absolute top-40 right-20 w-24 h-24 rounded-full bg-secondary/15 blur-lg -rotate-45"></div>
        <div className="absolute bottom-40 left-1/4 w-40 h-40 rounded-full bg-primary/5 blur-2xl rotate-45"></div>
        <div className="absolute bottom-20 right-1/3 w-28 h-28 rounded-full bg-primary-light/10 blur-xl rotate-30"></div>

        {/* Organic flowing lines */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1200 800" preserveAspectRatio="none">
          <path
            d="M0,400 Q300,200 600,400 T1200,400"
            stroke="currentColor"
            strokeOpacity="0.05"
            strokeWidth="150"
            fill="none"
            className="text-primary"
          />
          <path
            d="M0,600 Q400,500 800,600 T1200,550"
            stroke="currentColor"
            strokeOpacity="0.05"
            strokeWidth="100"
            fill="none"
            className="text-secondary"
          />
        </svg>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 relative z-[1]">
        <div className="space-y-8">
          {/* 页面标题 */}
          <div>
            <h1 className="text-2xl font-semibold">播客转录</h1>
            <p className="text-muted-foreground mt-1">粘贴小宇宙播客链接，自动转录为文字</p>
          </div>

          {/* Toast 提示 */}
          {toast && (
            <ToastManager
              message={toast.message}
              type={toast.type}
              onClose={() => setToast(null)}
            />
          )}

          {/* 播客转录功能卡 */}
          <Card className="relative z-[1]">
            <CardHeader>
              <CardTitle>开始转录</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePodcastTranscribe} className="space-y-4">
                <div>
                  <label htmlFor="podcast-url" className="block text-sm font-medium mb-2">
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
                      className="bg-gradient-to-r from-primary to-primary-light hover:from-primary-dark hover:to-primary transition-all"
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
                    输入小宇宙播客链接，自动提取音频并转录为文字
                  </p>
                </div>
              </form>

              {/* 实时转录进度 */}
              {isLoading && (
                <div className="mt-6 space-y-4">
                  {/* 阶段指示器 */}
                  <div className="flex items-center gap-3">
                    <FlowLoader size="sm" />
                    <div>
                      <span className="text-sm font-medium">{transcribeStage}</span>
                      {episodeTitle && (
                        <p className="text-xs text-muted-foreground mt-0.5">{episodeTitle}</p>
                      )}
                    </div>
                  </div>

                  {/* 转录进度条 */}
                  {transcribeStatus === 'transcribing' && transcribeProgress !== null && (
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>转录进度</span>
                        <span>{transcribeProgress}%</span>
                      </div>
                      <Progress value={transcribeProgress} />
                    </div>
                  )}

                  {/* 实时文稿区域 */}
                  {liveSegments.length > 0 && (
                    <div
                      ref={scrollRef}
                      className="max-h-[500px] overflow-y-auto px-4 py-2 rounded-xl border border-border/40 bg-muted/20"
                    >
                      {liveSegments.map(renderSegmentRow)}
                    </div>
                  )}
                </div>
              )}

              {/* 播客转录结果展示 */}
              {!isLoading && (podcastTranscript || podcastAudioInfo) && (
                <div className="mt-6 space-y-6">
                  {podcastAudioInfo && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span>{episodeTitle || '音频信息'}</span>
                          <div className="flex gap-2">
                            <Badge variant="secondary">{podcastAudioInfo.language}</Badge>
                            <Badge variant="outline">{podcastAudioInfo.wordCount} 字</Badge>
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="bg-muted/30 p-4 rounded-xl">
                            <audio controls className="w-full rounded-lg">
                              <source src={podcastAudioInfo.audioUrl} type="audio/mpeg" />
                              您的浏览器不支持音频元素。
                            </audio>
                          </div>
                          {savedPath && (
                            <p className="text-xs text-muted-foreground">
                              文件已保存到: {savedPath}
                            </p>
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
                              setToast({ message: '已复制到剪贴板', type: 'success' });
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
                                <div className="whitespace-pre-wrap leading-relaxed text-base">
                                  {podcastTranscript}
                                </div>
                              )}
                            </div>
                          </TabsContent>
                          <TabsContent value="plain" className="mt-4">
                            <div className="px-2 whitespace-pre-wrap leading-relaxed text-base">
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

          {/* 转录历史记录列表 */}
          <Card>
            <CardHeader>
              <CardTitle>转录历史</CardTitle>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="flex justify-center items-center h-32">
                  <FlowLoader size="md" />
                </div>
              ) : transcriptionHistory.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {transcriptionHistory.map((record) => (
                    <TranscriptionCard
                      key={record.id}
                      record={record}
                      onDeleted={handleRecordDeleted}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">暂无转录历史</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
