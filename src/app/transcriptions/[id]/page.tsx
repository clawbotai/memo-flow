'use client';

import { useEffect, useState } from 'react';
import TranscriptionDetail from '@/components/transcription-detail';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FlowLoader } from '@/components/ui/flow-loader';
import type { TranscriptionRecord } from '@/types/transcription-history';
import { helperRequest } from '@/lib/local-helper-client';
import {
  getCachedTranscriptionRecord,
  mergeCachedTranscriptionHistory,
} from '@/lib/transcription-browser-cache';

interface TranscriptionDetailPageProps {
  params: {
    id: string;
  };
}

export default function TranscriptionDetailPage({ params }: TranscriptionDetailPageProps) {
  const [record, setRecord] = useState<TranscriptionRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRecord = async () => {
      try {
        const result = await helperRequest<{
          success: boolean;
          data: TranscriptionRecord;
        }>(`/transcriptions/${params.id}`);

        if (result.success) {
          const merged = mergeCachedTranscriptionHistory([result.data]);
          setRecord(merged.find((item) => item.id === params.id) ?? result.data);
        } else {
          setRecord(getCachedTranscriptionRecord(params.id));
        }
      } catch (error) {
        console.error('加载转录详情失败:', error);
        setRecord(getCachedTranscriptionRecord(params.id));
      } finally {
        setLoading(false);
      }
    };

    loadRecord();
  }, [params.id]);

  return (
    <div className="min-h-full bg-background relative overflow-hidden">
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-10 left-10 w-32 h-32 rounded-full bg-primary/10 blur-xl rotate-12"></div>
        <div className="absolute top-40 right-20 w-24 h-24 rounded-full bg-secondary/15 blur-lg -rotate-45"></div>
        <div className="absolute bottom-40 left-1/4 w-40 h-40 rounded-full bg-primary/5 blur-2xl rotate-45"></div>
        <div className="absolute bottom-20 right-1/3 w-28 h-28 rounded-full bg-primary-light/10 blur-xl rotate-30"></div>

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

      <div className="max-w-7xl mx-auto px-6 py-8 relative z-10">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold">转录详情</h1>
            <p className="text-muted-foreground mt-1">查看转录任务的详细信息和实时进度</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>转录任务信息</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center items-center h-64">
                  <div className="text-center">
                    <FlowLoader size="md" />
                    <p className="mt-2 text-muted-foreground">正在加载转录详情...</p>
                  </div>
                </div>
              ) : record ? (
                <TranscriptionDetail record={record} />
              ) : (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <h2 className="text-xl font-semibold mb-2">转录记录不存在</h2>
                    <p className="text-muted-foreground">当前实例未命中记录，且浏览器缓存中也没有该条详情。</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
