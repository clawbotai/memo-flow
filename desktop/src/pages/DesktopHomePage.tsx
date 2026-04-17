'use client';

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileSearch, History, Library, Mic } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FlowLoader } from "@/components/ui/flow-loader";
import { helperRequest } from "@/lib/local-helper-client";
import {
  mergeCachedTranscriptionHistory,
  readCachedTranscriptionHistory,
} from "@/lib/transcription-browser-cache";
import type { TranscriptionRecord } from "@/types/transcription-history";
import { DesktopTranscriptionCard } from "@desktop/components/DesktopTranscriptionCard";
import { PageScene } from "@desktop/components/PageScene";

export function DesktopHomePage() {
  const [recentRecords, setRecentRecords] = useState<TranscriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const handleRecordDeleted = useCallback((recordId: string) => {
    setRecentRecords((prev) => prev.filter((record) => record.id !== recordId));
  }, []);

  useEffect(() => {
    const loadRecent = async () => {
      try {
        const result = await helperRequest<{
          success: boolean;
          data: TranscriptionRecord[];
        }>("/transcriptions");

        if (result.success) {
          const sorted = mergeCachedTranscriptionHistory(result.data)
            .sort(
              (a, b) =>
                new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
            )
            .slice(0, 3);
          setRecentRecords(sorted);
        } else {
          setRecentRecords(readCachedTranscriptionHistory().slice(0, 3));
        }
      } catch (error) {
        console.error("获取最近转录失败:", error);
        setRecentRecords(readCachedTranscriptionHistory().slice(0, 3));
      } finally {
        setLoading(false);
      }
    };

    loadRecent();
  }, []);

  const features = [
    {
      icon: <Mic className="w-5 h-5" />,
      title: "播客转录",
      description: "支持小宇宙 / Apple Podcasts 单集链接转录",
      href: "/podcast",
      available: true,
    },
    {
      icon: <History className="w-5 h-5" />,
      title: "转录历史",
      description: "查看和管理所有转录记录",
      href: "/transcriptions",
      available: true,
    },
    {
      icon: <FileSearch className="w-5 h-5" />,
      title: "内容解析",
      description: "智能分析播客内容，提取关键信息",
      href: "#",
      available: false,
    },
    {
      icon: <Library className="w-5 h-5" />,
      title: "知识库",
      description: "整理和管理你的播客知识体系",
      href: "#",
      available: false,
    },
  ];

  return (
    <PageScene>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">欢迎使用 Linksy</h1>
          <p className="mt-1 text-muted-foreground">Turn any link into reusable knowledge</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {features.map((feature) => {
            const content = (
              <Card
                key={feature.title}
                className={`relative transition-all ${
                  feature.available ? "cursor-pointer hover:border-primary/30 hover:shadow-md" : "opacity-60"
                }`}
              >
                <CardContent className="flex items-start gap-4 p-5">
                  <div className="shrink-0 rounded-xl bg-primary/10 p-2.5 text-primary">
                    {feature.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium">{feature.title}</h3>
                      {!feature.available && (
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                          即将推出
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{feature.description}</p>
                  </div>
                </CardContent>
              </Card>
            );

            if (feature.available) {
              return (
                <Link key={feature.title} to={feature.href} className="block">
                  {content}
                </Link>
              );
            }

            return <div key={feature.title}>{content}</div>;
          })}
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>最近转录</CardTitle>
              {recentRecords.length > 0 && (
                <Link
                  to="/transcriptions"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  查看全部
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-24 items-center justify-center">
                <FlowLoader size="md" />
              </div>
            ) : recentRecords.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {recentRecords.map((record) => (
                  <DesktopTranscriptionCard
                    key={record.id}
                    record={record}
                    onDeleted={handleRecordDeleted}
                  />
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-muted-foreground">还没有转录记录</p>
                <Link to="/podcast" className="mt-2 inline-block text-sm text-primary hover:underline">
                  开始第一次转录
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageScene>
  );
}
