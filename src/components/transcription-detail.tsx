'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FlowLoader } from '@/components/ui/flow-loader';
import { Copy, Check, ChevronDown, FileText, Clock } from 'lucide-react';
import type { TranscribeSegment } from '@/types';
import { TranscriptionRecord } from '@/types/transcription-history';
import { useTranscriptionConfig } from '@/hooks/use-transcription-config';
import {
  createHelperEventSource,
  helperRequest,
  isHelperUnavailableError,
} from '@/lib/local-helper-client';
import { upsertCachedTranscriptionRecord } from '@/lib/transcription-browser-cache';

interface TranscriptionDetailProps {
  record: TranscriptionRecord;
}

const STATUS_TEXT: Record<string, string> = {
  idle: '待开始',
  fetching_info: '获取信息中',
  downloading_audio: '下载音频中',
  converting: '转换格式中',
  transcribing: '转录中',
  completed: '已完成',
  error: '出现错误',
};

const STATUS_COLOR: Record<string, string> = {
  completed: 'bg-green-500',
  transcribing: 'bg-blue-500',
  fetching_info: 'bg-yellow-500',
  downloading_audio: 'bg-yellow-500',
  converting: 'bg-yellow-500',
  error: 'bg-red-500',
};

/** 将 whisper timestamp 格式化为 MM:SS */
function formatTimestamp(ts: string): string {
  const match = ts.match(/(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return '00:00';
  const totalMinutes = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  return `${String(totalMinutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const TranscriptionDetail: React.FC<TranscriptionDetailProps> = ({ record }) => {
  const { config } = useTranscriptionConfig();
  const [liveRecord, setLiveRecord] = useState<TranscriptionRecord>(record);
  const [connected, setConnected] = useState(false);
  const [retranscribing, setRetranscribing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const copyMenuRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneRef = useRef(false);

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimeoutRef.current !== null) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const closeEventSource = useCallback(() => {
    clearReconnectTimer();
    esRef.current?.close();
    esRef.current = null;
  }, [clearReconnectTimer]);

  const connectToLiveRecord = useCallback((ignoreTerminalSnapshot = false) => {
    if (doneRef.current) return;

    clearReconnectTimer();
    esRef.current?.close();

    const es = createHelperEventSource(`/transcriptions/${record.id}/live`);
    let hasSeenActiveUpdate = false;
    esRef.current = es;

    es.onopen = () => {
      setConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          success?: boolean;
          data?: TranscriptionRecord;
        };

        if (!payload.success || !payload.data) {
          return;
        }

        const nextRecord = payload.data;
        const isTerminal = nextRecord.status === 'completed' || nextRecord.status === 'error';

        if (ignoreTerminalSnapshot && !hasSeenActiveUpdate && isTerminal) {
          return;
        }

        if (!isTerminal) {
          hasSeenActiveUpdate = true;
        }

        setLiveRecord(nextRecord);
        upsertCachedTranscriptionRecord(nextRecord);
        scrollToBottom();

        if (isTerminal) {
          doneRef.current = true;
          setConnected(false);
          if (esRef.current === es) {
            esRef.current = null;
          }
          es.close();
        }
      } catch (e) {
        console.error('SSE 解析失败:', e);
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();

      if (esRef.current === es) {
        esRef.current = null;
      }

      if (doneRef.current) {
        return;
      }

      clearReconnectTimer();
      reconnectTimeoutRef.current = setTimeout(() => {
        if (!doneRef.current) {
          connectToLiveRecord(ignoreTerminalSnapshot);
        }
      }, 3000);
    };
  }, [clearReconnectTimer, record.id, scrollToBottom]);

  // 连接 SSE
  useEffect(() => {
    doneRef.current = false;
    connectToLiveRecord();

    return () => {
      doneRef.current = true;
      setConnected(false);
      closeEventSource();
    };
  }, [closeEventSource, connectToLiveRecord]);

  // 重新转录
  const handleRetranscribe = useCallback(async () => {
    setRetranscribing(true);
    try {
      const result = await helperRequest<{ success: boolean; error?: string }>(
        `/transcriptions/${record.id}/retranscribe`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
          engine: config.activeEngine,
          onlineASRConfig: config.onlineASR,
          }),
        },
      );
      if (!result.success) {
        console.error('重新转录失败:', result.error);
        setRetranscribing(false);
        return;
      }

      // 重置状态并切回统一的 SSE 重连逻辑
      doneRef.current = false;
      setConnected(false);
      closeEventSource();

      const nextStatus = config.activeEngine === 'qwen-asr' ? 'transcribing' : 'downloading_audio';
      const resetRecord: TranscriptionRecord = {
        ...liveRecord,
        status: nextStatus,
        progress: 0,
        segments: [],
        transcript: '',
        wordCount: undefined,
        language: undefined,
        error: undefined,
        updatedAt: new Date(),
      };

      setLiveRecord(resetRecord);
      upsertCachedTranscriptionRecord(resetRecord);

      connectToLiveRecord(true);
    } catch (error) {
      if (isHelperUnavailableError(error)) {
        console.error('本机 helper 未连接');
      }
      console.error('重新转录请求失败:', error);
    } finally {
      setRetranscribing(false);
    }
  }, [closeEventSource, config, connectToLiveRecord, liveRecord, record.id]);

  const status = liveRecord.status;
  const segments: TranscribeSegment[] = liveRecord.segments ?? [];
  const isActive = status !== 'completed' && status !== 'error';
  const canRetranscribe = (status === 'completed' || status === 'error') && !!record.audioUrl;

  // 复制纯文本（不含时间戳）
  const handleCopyPlainText = useCallback(async () => {
    const textToCopy = segments.length > 0
      ? segments.map(seg => seg.text).join('\n')
      : liveRecord.transcript || '';
    
    if (!textToCopy) return;
    
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setCopyMenuOpen(false);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('复制失败:', error);
    }
  }, [segments, liveRecord.transcript]);

  // 复制逐字稿（含时间戳）
  const handleCopyWithTimestamp = useCallback(async () => {
    const textToCopy = segments.length > 0
      ? segments.map(seg => `[${seg.timestamp}] ${seg.text}`).join('\n')
      : liveRecord.transcript || '';
    
    if (!textToCopy) return;
    
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setCopyMenuOpen(false);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('复制失败:', error);
    }
  }, [segments, liveRecord.transcript]);

  // 点击外部关闭复制菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (copyMenuRef.current && !copyMenuRef.current.contains(event.target as Node)) {
        setCopyMenuOpen(false);
      }
    };
    
    if (copyMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [copyMenuOpen]);

  useEffect(() => {
    if (segments.length > 0 || liveRecord.transcript) {
      scrollToBottom();
    }
  }, [segments.length, liveRecord.transcript, scrollToBottom]);

  return (
    <div className="flex flex-col md:flex-row h-full gap-6 min-h-0">
      {/* ── 左侧：音源信息 ── */}
      <div className="w-full md:w-[360px] shrink-0 flex flex-col gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span>音频信息</span>
              <Badge
                className={`${STATUS_COLOR[status] ?? 'bg-gray-500'} text-white text-xs`}
              >
                {STATUS_TEXT[status] ?? status}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 标题 */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">标题</p>
              <p className="text-sm font-medium leading-snug">{liveRecord.title}</p>
            </div>

            {/* 音频播放器 */}
            {liveRecord.audioUrl && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">音源</p>
                <div className="bg-muted/30 p-3 rounded-xl">
                  <audio controls className="w-full" preload="metadata">
                    <source src={liveRecord.audioUrl} type="audio/mpeg" />
                    您的浏览器不支持音频播放。
                  </audio>
                </div>
              </div>
            )}

            {/* 元信息 */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {liveRecord.wordCount != null && (
                <div>
                  <p className="text-xs text-muted-foreground">字数</p>
                  <p className="font-medium">{liveRecord.wordCount.toLocaleString()}</p>
                </div>
              )}
              {liveRecord.language && (
                <div>
                  <p className="text-xs text-muted-foreground">语言</p>
                  <p className="font-medium">{liveRecord.language}</p>
                </div>
              )}
              {liveRecord.duration != null && (
                <div>
                  <p className="text-xs text-muted-foreground">时长</p>
                  <p className="font-medium">{liveRecord.duration}s</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">片段数</p>
                <p className="font-medium">{segments.length}</p>
              </div>
            </div>

            {/* 进度条 */}
            {isActive && liveRecord.progress != null && (
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                  <span>转录进度</span>
                  <span>{liveRecord.progress}%</span>
                </div>
                <Progress value={liveRecord.progress} className="h-1.5" />
                {!connected && (
                  <div className="flex items-center gap-2 mt-2 text-yellow-600 text-xs">
                    <FlowLoader size="sm" />
                    <span>重新连接中...</span>
                  </div>
                )}
              </div>
            )}

            {/* 保存路径 */}
            {liveRecord.savedPath && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">保存路径</p>
                <p className="text-xs break-all text-muted-foreground/80 bg-muted/30 p-2 rounded-lg">
                  {liveRecord.savedPath}
                </p>
              </div>
            )}

            {/* 错误信息 */}
            {status === 'error' && (
              <div className="bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-xs p-3 rounded-lg">
                {liveRecord.error || '转录失败，请检查网络和音频链接后重试。'}
              </div>
            )}

            {/* 重新转录按钮 */}
            {canRetranscribe && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={retranscribing}
                onClick={handleRetranscribe}
              >
                {retranscribing ? (
                  <>
                    <FlowLoader size="sm" />
                    <span className="ml-2">正在发起重新转录…</span>
                  </>
                ) : (
                  '重新转录'
                )}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* 预留卡片 */}
        <Card className="flex-1 min-h-[120px]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">扩展信息</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {status === 'completed' ? '可在此添加摘要、关键词等分析结果。' : '转录完成后在此展示更多信息。'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── 右侧：逐字稿 ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        <Card className="flex flex-col h-[520px] md:h-[640px]">
          <CardHeader className="pb-3 shrink-0">
            <CardTitle className="flex items-center justify-between text-base">
              <span>转录逐字稿</span>
              <div className="flex items-center gap-2">
                {isActive && connected && (
                  <span className="flex items-center gap-1.5 text-xs text-blue-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    实时更新中
                  </span>
                )}
                <Badge variant="outline" className="text-xs">
                  {segments.length} 片段
                </Badge>
                {/* 复制按钮 */}
                {(segments.length > 0 || liveRecord.transcript) && (
                  <div className="relative" ref={copyMenuRef}>
                    <button
                      onClick={() => setCopyMenuOpen(!copyMenuOpen)}
                      className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                      title="复制选项"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    
                    {/* 复制选项下拉菜单 */}
                    {copyMenuOpen && (
                      <div className="absolute right-0 top-full mt-1 w-40 bg-popover border border-border rounded-lg shadow-lg py-1 z-50">
                        <button
                          onClick={handleCopyPlainText}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 transition-colors"
                        >
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <span>纯文本</span>
                        </button>
                        <button
                          onClick={handleCopyWithTimestamp}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 transition-colors"
                        >
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <span>带时间戳</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardTitle>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col min-h-0 p-0 px-6 pb-6">
            {segments.length > 0 ? (
              /* ── 有 segments：逐行展示 ── */
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto space-y-0 scroll-smooth pr-2"
              >
                {segments.map((seg, idx) => (
                  <div
                    key={idx}
                    className="flex items-baseline gap-4 py-2.5 border-b border-border/30 last:border-b-0"
                  >
                    <span className="text-xs text-muted-foreground font-mono tabular-nums shrink-0 w-11 pt-0.5">
                      {formatTimestamp(seg.timestamp)}
                    </span>
                    <span className="text-sm leading-relaxed flex-1">{seg.text}</span>
                  </div>
                ))}

                {/* 转录中时在末尾显示动画光标 */}
                {isActive && (
                  <div className="flex items-center gap-3 py-3">
                    <span className="w-11 shrink-0" />
                    <FlowLoader size="sm" />
                    <span className="text-xs text-muted-foreground">转录中…</span>
                  </div>
                )}
              </div>
            ) : liveRecord.transcript ? (
              /* ── 无 segments 但有纯文本（fallback）── */
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto whitespace-pre-wrap leading-relaxed text-sm pr-2"
              >
                {liveRecord.transcript}
              </div>
            ) : (
              /* ── 空状态 ── */
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                {isActive ? (
                  <>
                    <FlowLoader size="md" />
                    <p className="text-sm">
                      {STATUS_TEXT[status] ?? '处理中'}，转录内容将实时出现…
                    </p>
                  </>
                ) : (
                  <p className="text-sm">暂无转录内容</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TranscriptionDetail;
