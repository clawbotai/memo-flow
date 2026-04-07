'use client';

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FlowLoader } from "@/components/ui/flow-loader";
import { helperRequest } from "@/lib/local-helper-client";
import {
  mergeCachedTranscriptionHistory,
  readCachedTranscriptionHistory,
  removeCachedTranscriptionRecord,
} from "@/lib/transcription-browser-cache";
import type { TranscriptionRecord } from "@/types/transcription-history";
import { DesktopTranscriptionCard } from "@desktop/components/DesktopTranscriptionCard";
import { PageScene } from "@desktop/components/PageScene";

export function DesktopTranscriptionsPage() {
  const [records, setRecords] = useState<TranscriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRecords = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setLoading(true);
    }

    try {
      const result = await helperRequest<{
        success: boolean;
        data: TranscriptionRecord[];
      }>("/transcriptions");

      if (result.success) {
        setRecords(mergeCachedTranscriptionHistory(result.data));
      } else {
        setRecords(readCachedTranscriptionHistory());
      }
    } catch (error) {
      console.error("加载转录历史失败:", error);
      setRecords(readCachedTranscriptionHistory());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecords(true);
  }, [loadRecords]);

  useEffect(() => {
    const handleFocus = () => {
      loadRecords(false);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadRecords(false);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadRecords]);

  return (
    <PageScene>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">我的转录</h1>
          <p className="mt-1 text-muted-foreground">查看和管理您的转录历史</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>转录历史</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-32 items-center justify-center">
                <FlowLoader size="md" />
              </div>
            ) : records.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {records.map((record) => (
                  <DesktopTranscriptionCard
                    key={record.id}
                    record={record}
                    onDeleted={(recordId) => setRecords(removeCachedTranscriptionRecord(recordId))}
                  />
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-muted-foreground">暂无转录记录</p>
            )}
          </CardContent>
        </Card>
      </div>
    </PageScene>
  );
}
