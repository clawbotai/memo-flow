'use client';

import { useEffect, useState } from 'react';
import TranscriptionCard from '@/components/transcription-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FlowLoader } from '@/components/ui/flow-loader';
import type { TranscriptionRecord } from '@/types/transcription-history';
import {
  mergeCachedTranscriptionHistory,
  readCachedTranscriptionHistory,
  removeCachedTranscriptionRecord,
} from '@/lib/transcription-browser-cache';

export default function TranscriptionsPage() {
  const [records, setRecords] = useState<TranscriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRecords = async () => {
      try {
        const response = await fetch('/api/transcription-history');
        const result = await response.json();

        if (result.success) {
          setRecords(mergeCachedTranscriptionHistory(result.data));
        } else {
          setRecords(readCachedTranscriptionHistory());
        }
      } catch (error) {
        console.error('加载转录历史失败:', error);
        setRecords(readCachedTranscriptionHistory());
      } finally {
        setLoading(false);
      }
    };

    loadRecords();
  }, []);

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

      <div className="max-w-5xl mx-auto px-6 py-8 relative z-10">
        <div className="space-y-8">
          <div>
            <h1 className="text-2xl font-semibold">我的转录</h1>
            <p className="text-muted-foreground mt-1">查看和管理您的转录历史</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>转录历史</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center items-center h-32">
                  <FlowLoader size="md" />
                </div>
              ) : records.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {records.map((record) => (
                    <TranscriptionCard
                      key={record.id}
                      record={record}
                      onDeleted={(recordId) => setRecords(removeCachedTranscriptionRecord(recordId))}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">暂无转录记录</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
