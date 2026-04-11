'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Loader2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FlowLoader } from '@/components/ui/flow-loader';
import { ToastManager } from '@/components/ui/toast';
import {
  fetchContentDrafts,
  fetchContentPoints,
  generateContentDraft,
  generateContentPoints,
} from '@/lib/content-generation';
import { fetchLanguageModelSettings } from '@/lib/language-model-settings';
import {
  LANGUAGE_MODEL_PROVIDER_META,
  LANGUAGE_MODEL_PROVIDER_ORDER,
} from '@/lib/language-models';
import type {
  ContentPlatform,
  ContentPointType,
  GeneratedContentDraft,
  GeneratedPoint,
  LanguageModelProvider,
} from '@/types';
import type { TranscriptionRecord } from '@/types/transcription-history';

interface ProviderOption {
  provider: LanguageModelProvider;
  label: string;
  model: string;
}

interface TranscriptionContentGenerationProps {
  record: TranscriptionRecord;
  onRecordPatch: (patch: Partial<TranscriptionRecord>) => void;
}

const PLATFORM_OPTIONS: Array<{ value: ContentPlatform; label: string }> = [
  { value: 'redbook', label: '小红书' },
];

const POINT_GROUPS: Array<{
  type: ContentPointType;
  label: string;
  emptyText: string;
}> = [
  { type: 'viral', label: '传播观点', emptyText: '暂无传播观点' },
  { type: 'controversial', label: '争议观点', emptyText: '暂无争议观点' },
  { type: 'quote', label: '金句', emptyText: '暂无金句' },
];

function buildDraftCopyText(draft: GeneratedContentDraft) {
  return [
    draft.title || '',
    draft.content,
    Array.isArray(draft.tags) && draft.tags.length ? draft.tags.map((tag) => `#${tag}`).join(' ') : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function PointCard({
  point,
  selected,
  onToggle,
}: {
  point: GeneratedPoint;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full rounded-2xl border p-4 text-left transition-all ${
        selected
          ? 'border-primary/35 bg-primary/[0.07] shadow-[0_10px_24px_rgba(24,68,39,0.08)]'
          : 'border-border/60 bg-background/75 hover:border-border hover:bg-background'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-sm font-medium leading-6 text-foreground">{point.text}</p>
          {(point.sourceTimestamp || point.sourceText) && (
            <div className="space-y-1.5 rounded-xl border border-border/60 bg-muted/35 px-3 py-2.5">
              {point.sourceTimestamp && (
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {point.sourceTimestamp}
                </p>
              )}
              {point.sourceText && (
                <p className="text-xs leading-5 text-muted-foreground">{point.sourceText}</p>
              )}
            </div>
          )}
        </div>
        <span
          className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
            selected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border/70 bg-background text-transparent'
          }`}
        >
          <Check className="h-3.5 w-3.5" />
        </span>
      </div>
    </button>
  );
}

export function TranscriptionContentGeneration({
  record,
  onRecordPatch,
}: TranscriptionContentGenerationProps) {
  const requestRecordIdRef = useRef('');
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<LanguageModelProvider | ''>('');
  const [platform, setPlatform] = useState<ContentPlatform>('redbook');
  const [points, setPoints] = useState<GeneratedPoint[]>([]);
  const [theme, setTheme] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState<GeneratedContentDraft | null>(null);
  const [selectedPointIds, setSelectedPointIds] = useState<string[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const isCompleted = record.status === 'completed';
  const hasProviders = providers.length > 0;
  const selectedPoints = useMemo(() => {
    const selectedSet = new Set(selectedPointIds);
    return points.filter((point) => selectedSet.has(point.id));
  }, [points, selectedPointIds]);
  const pointGroups = useMemo(() => {
    return POINT_GROUPS.map((group) => ({
      ...group,
      points: points.filter((point) => point.type === group.type),
    }));
  }, [points]);

  const canExtract = isCompleted && hasProviders && Boolean(selectedProvider) && !extracting;
  const canGenerate = canExtract && selectedPoints.length > 0 && !generating;

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  };

  const syncSelection = (nextPoints: GeneratedPoint[]) => {
    setSelectedPointIds((prev) => {
      const allowed = new Set(nextPoints.map((point) => point.id));
      const preserved = prev.filter((id) => allowed.has(id));
      if (preserved.length > 0) {
        return preserved;
      }
      return nextPoints.map((point) => point.id);
    });
  };

  useEffect(() => {
    if (!copied) {
      return undefined;
    }
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    requestRecordIdRef.current = record.id;
    setPoints([]);
    setTheme(undefined);
    setDraft(null);
    setSelectedPointIds([]);
    setPlatform('redbook');
    setExtracting(false);
    setGenerating(false);

    const loadProviders = async () => {
      setLoadingProviders(true);
      try {
        const settings = await fetchLanguageModelSettings();
        if (requestRecordIdRef.current !== record.id) {
          return;
        }

        const nextProviders = LANGUAGE_MODEL_PROVIDER_ORDER.flatMap((provider) => {
          const config = settings.providers[provider];
          if (!config.enabled || !config.apiKeyConfigured) {
            return [];
          }
          return [
            {
              provider,
              label: `${LANGUAGE_MODEL_PROVIDER_META[provider].label} · ${config.model}`,
              model: config.model,
            },
          ];
        });

        setProviders(nextProviders);
        setSelectedProvider((prev) => {
          if (prev && nextProviders.some((item) => item.provider === prev)) {
            return prev;
          }
          return nextProviders[0]?.provider ?? '';
        });
      } catch (error) {
        if (requestRecordIdRef.current === record.id) {
          showToast(error instanceof Error ? error.message : '读取模型配置失败', 'error');
        }
      } finally {
        if (requestRecordIdRef.current === record.id) {
          setLoadingProviders(false);
        }
      }
    };

    const loadPersistedData = async () => {
      if (!record.savedPath) {
        return;
      }

      setLoadingData(true);
      try {
        const [pointResult, draftResult] = await Promise.allSettled([
          fetchContentPoints(record.id),
          fetchContentDrafts(record.id),
        ]);

        if (requestRecordIdRef.current !== record.id) {
          return;
        }

        const nextPoints = pointResult.status === 'fulfilled' ? pointResult.value.points : [];
        const nextDraft = draftResult.status === 'fulfilled'
          ? (draftResult.value.drafts.redbook ?? null)
          : null;

        if (pointResult.status === 'fulfilled') {
          setTheme(pointResult.value.theme);
          setPoints(nextPoints);
        }

        if (nextDraft) {
          setDraft(nextDraft);
        }

        if (nextPoints.length > 0) {
          const draftSourcePointIds = nextDraft?.sourcePointIds?.filter((pointId) =>
            nextPoints.some((point) => point.id === pointId),
          ) || [];

          if (draftSourcePointIds.length > 0) {
            setSelectedPointIds(draftSourcePointIds);
          } else {
            syncSelection(nextPoints);
          }
        }
      } finally {
        if (requestRecordIdRef.current === record.id) {
          setLoadingData(false);
        }
      }
    };

    void loadProviders();
    void loadPersistedData();

    return () => {
      requestRecordIdRef.current = '';
    };
  }, [record.id, record.savedPath]);

  const handleTogglePoint = (pointId: string) => {
    setSelectedPointIds((prev) => (
      prev.includes(pointId) ? prev.filter((id) => id !== pointId) : [...prev, pointId]
    ));
  };

  const handleExtract = async () => {
    if (!selectedProvider) {
      return;
    }

    setExtracting(true);
    onRecordPatch({
      pointExtractionStatus: 'generating',
      pointExtractionError: undefined,
    });

    try {
      const result = await generateContentPoints(record.id, {
        provider: selectedProvider,
        platform,
      });
      if (requestRecordIdRef.current !== record.id) {
        return;
      }

      setTheme(result.theme);
      setPoints(result.points);
      setSelectedPointIds(result.points.map((point) => point.id));
      onRecordPatch({
        pointExtractionStatus: 'ready',
        pointExtractionUpdatedAt: new Date(result.updatedAt),
        pointExtractionError: undefined,
      });
      showToast('观点提炼完成', 'success');
    } catch (error) {
      if (requestRecordIdRef.current === record.id) {
        onRecordPatch({
          pointExtractionStatus: points.length > 0 ? 'ready' : 'error',
          pointExtractionError: error instanceof Error ? error.message : '观点提炼失败',
        });
        showToast(error instanceof Error ? error.message : '观点提炼失败', 'error');
      }
    } finally {
      if (requestRecordIdRef.current === record.id) {
        setExtracting(false);
      }
    }
  };

  const handleGenerate = async () => {
    if (!selectedProvider || platform !== 'redbook' || selectedPoints.length === 0) {
      return;
    }

    setGenerating(true);
    onRecordPatch({
      contentGenerationStatus: 'generating',
      contentGenerationError: undefined,
    });

    try {
      const nextDraft = await generateContentDraft(record.id, {
        provider: selectedProvider,
        platform,
        selectedPointIds,
      });
      if (requestRecordIdRef.current !== record.id || !nextDraft) {
        return;
      }

      setDraft(nextDraft);
      onRecordPatch({
        contentGenerationStatus: 'ready',
        contentGenerationUpdatedAt: new Date(nextDraft.updatedAt),
        contentGenerationError: undefined,
      });
      showToast('小红书初稿已生成', 'success');
    } catch (error) {
      if (requestRecordIdRef.current === record.id) {
        onRecordPatch({
          contentGenerationStatus: draft ? 'ready' : 'error',
          contentGenerationError: error instanceof Error ? error.message : '内容生成失败',
        });
        showToast(error instanceof Error ? error.message : '内容生成失败', 'error');
      }
    } finally {
      if (requestRecordIdRef.current === record.id) {
        setGenerating(false);
      }
    }
  };

  const handleCopy = async () => {
    if (!draft) {
      return;
    }

    try {
      await navigator.clipboard.writeText(buildDraftCopyText(draft));
      setCopied(true);
      showToast('已复制小红书文案', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '复制失败', 'error');
    }
  };

  const statusHint = !isCompleted
    ? '转录完成后才能提炼观点和生成内容。'
    : !hasProviders
      ? '请先在设置中启用并保存至少一个可用的语言模型 Provider。'
      : null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
        <section className="flex min-h-0 flex-col rounded-[28px] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,246,0.88))] p-5 shadow-[0_18px_50px_rgba(20,40,20,0.06)]">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/50 pb-4">
            <div>
              <h3 className="text-base font-semibold">观点提炼</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                从逐字稿里抽取适合传播的观点，再选择作为生成依据。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                已选 {selectedPointIds.length} / {points.length || 0}
              </Badge>
              {record.pointExtractionStatus === 'ready' && record.pointExtractionUpdatedAt && (
                <Badge variant="secondary">
                  最近更新 {record.pointExtractionUpdatedAt.toLocaleString()}
                </Badge>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
            <div>
              <label className="mb-1.5 block text-xs font-medium tracking-[0.02em] text-foreground/85">
                模型
              </label>
              <div className="relative">
                <select
                  className="h-10 w-full appearance-none rounded-2xl border border-border/60 bg-white/85 px-3.5 pr-9 text-sm text-foreground outline-none transition-all focus:border-primary/35 focus:bg-white"
                  value={selectedProvider}
                  onChange={(event) => setSelectedProvider(event.target.value as LanguageModelProvider)}
                  disabled={loadingProviders || !hasProviders}
                >
                  {hasProviders ? (
                    providers.map((item) => (
                      <option key={item.provider} value={item.provider}>
                        {item.label}
                      </option>
                    ))
                  ) : (
                    <option value="">暂无可用模型</option>
                  )}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
                  {loadingProviders ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium tracking-[0.02em] text-foreground/85">
                平台
              </label>
              <select
                className="h-10 w-full appearance-none rounded-2xl border border-border/60 bg-white/85 px-3.5 text-sm text-foreground outline-none transition-all focus:border-primary/35 focus:bg-white"
                value={platform}
                onChange={(event) => setPlatform(event.target.value as ContentPlatform)}
              >
                {PLATFORM_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <Button className="w-full" disabled={!canExtract} onClick={handleExtract}>
                {extracting || record.pointExtractionStatus === 'generating' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    提炼中...
                  </>
                ) : (
                  '提炼观点'
                )}
              </Button>
            </div>
          </div>

          {statusHint && (
            <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700">
              {statusHint}
            </div>
          )}

          {record.pointExtractionError && (
            <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {record.pointExtractionError}
            </div>
          )}

          <div className="mt-5 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
            {loadingData ? (
              <div className="flex flex-1 items-center justify-center py-12">
                <div className="text-center">
                  <FlowLoader size="md" />
                  <p className="mt-3 text-sm text-muted-foreground">正在读取内容生成结果...</p>
                </div>
              </div>
            ) : points.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-[24px] border border-dashed border-border/60 bg-muted/20 px-6 py-12 text-center">
                <div className="max-w-md space-y-2">
                  <h4 className="text-sm font-medium">还没有观点结果</h4>
                  <p className="text-sm leading-6 text-muted-foreground">
                    选择模型后点击“提炼观点”，系统会按传播观点、争议观点和金句分类输出。
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-[24px] border border-border/60 bg-white/70 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        核心主题
                      </p>
                      <p className="mt-2 text-sm leading-6 text-foreground">
                        {theme || '本次未返回单独主题概括。'}
                      </p>
                    </div>
                    <Badge variant="secondary">内容输入源</Badge>
                  </div>
                </div>

                {pointGroups.map((group) => (
                  <div key={group.type} className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold">{group.label}</h4>
                      <Badge variant="outline">{group.points.length} 条</Badge>
                    </div>
                    {group.points.length > 0 ? (
                      <div className="space-y-3">
                        {group.points.map((point) => (
                          <PointCard
                            key={point.id}
                            point={point}
                            selected={selectedPointIds.includes(point.id)}
                            onToggle={() => handleTogglePoint(point.id)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-border/60 px-4 py-4 text-sm text-muted-foreground">
                        {group.emptyText}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col rounded-[28px] border border-border/60 bg-[radial-gradient(circle_at_top,rgba(246,250,242,0.95),rgba(255,255,255,0.98)_55%)] p-5 shadow-[0_18px_48px_rgba(20,40,20,0.05)]">
          <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-4">
            <div>
              <h3 className="text-base font-semibold">小红书初稿</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                基于已选观点生成标题、正文和标签，Phase 1 自动持久化保存。
              </p>
            </div>
            <Button variant="outline" size="sm" disabled={!draft} onClick={handleCopy}>
              {copied ? (
                <>
                  <Check className="mr-1.5 h-4 w-4 text-green-600" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="mr-1.5 h-4 w-4" />
                  复制
                </>
              )}
            </Button>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Button className="flex-1" disabled={!canGenerate} onClick={handleGenerate}>
              {generating || record.contentGenerationStatus === 'generating' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  生成中...
                </>
              ) : (
                '生成内容'
              )}
            </Button>
            <Badge variant="outline">
              {platform === 'redbook' ? '小红书' : platform}
            </Badge>
          </div>

          {!selectedPoints.length && points.length > 0 && (
            <div className="mt-4 rounded-2xl border border-border/60 bg-muted/35 px-4 py-3 text-sm text-muted-foreground">
              至少勾选一条观点后，才能生成平台内容。
            </div>
          )}

          {record.contentGenerationError && (
            <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {record.contentGenerationError}
            </div>
          )}

          <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-hidden">
            {draft ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[24px] border border-border/60 bg-white/82 p-4">
                <div className="flex items-center justify-between gap-3">
                  <Badge variant="secondary">Version {draft.version}</Badge>
                  <span className="text-xs text-muted-foreground">
                    更新于 {new Date(draft.updatedAt).toLocaleString()}
                  </span>
                </div>

                <div className="mt-4 space-y-4">
                  {draft.title && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        标题
                      </p>
                      <h4 className="mt-2 text-lg font-semibold leading-7 text-foreground">
                        {draft.title}
                      </h4>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      正文
                    </p>
                    <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-foreground">
                      {draft.content}
                    </div>
                  </div>

                  {draft.tags && draft.tags.length > 0 && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        标签
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {draft.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="rounded-full">
                            #{tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      依赖观点
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedPoints.map((point) => (
                        <Badge key={point.id} variant="secondary" className="rounded-full">
                          {point.text}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-[24px] border border-dashed border-border/60 bg-muted/20 px-6 py-12 text-center">
                <div className="max-w-sm space-y-2">
                  <h4 className="text-sm font-medium">还没有平台初稿</h4>
                  <p className="text-sm leading-6 text-muted-foreground">
                    提炼观点并勾选你要保留的重点后，点击“生成内容”即可得到一版可直接修改发布的小红书初稿。
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {toast && (
        <ToastManager
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
