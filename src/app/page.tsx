'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FlowLoader } from '@/components/ui/flow-loader';
import { Badge } from '@/components/ui/badge';
import { Mic, History, FileSearch, Library } from 'lucide-react';
import { TranscriptionRecord } from '@/types/transcription-history';
import TranscriptionCard from '@/components/transcription-card';
import {
  mergeCachedTranscriptionHistory,
  readCachedTranscriptionHistory,
} from '@/lib/transcription-browser-cache';

export default function Home() {
  const [recentRecords, setRecentRecords] = useState<TranscriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const handleRecordDeleted = useCallback((recordId: string) => {
    setRecentRecords((prev) => prev.filter((record) => record.id !== recordId));
  }, []);

  useEffect(() => {
    const loadRecent = async () => {
      try {
        const response = await fetch('/api/transcription-history');
        const result = await response.json();
        if (result.success) {
          const sorted = mergeCachedTranscriptionHistory(result.data)
            .sort((a: TranscriptionRecord, b: TranscriptionRecord) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            )
            .slice(0, 3);
          setRecentRecords(sorted);
        } else {
          setRecentRecords(readCachedTranscriptionHistory().slice(0, 3));
        }
      } catch (error) {
        console.error('获取最近转录失败:', error);
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
      title: '播客转录',
      description: '粘贴小宇宙播客链接，自动转录为文字',
      href: '/podcast',
      available: true,
    },
    {
      icon: <History className="w-5 h-5" />,
      title: '转录历史',
      description: '查看和管理所有转录记录',
      href: '/transcriptions',
      available: true,
    },
    {
      icon: <FileSearch className="w-5 h-5" />,
      title: '内容解析',
      description: '智能分析播客内容，提取关键信息',
      href: '#',
      available: false,
    },
    {
      icon: <Library className="w-5 h-5" />,
      title: '知识库',
      description: '整理和管理你的播客知识体系',
      href: '#',
      available: false,
    },
  ];

  return (
    <div className="min-h-full bg-background relative overflow-hidden">
      {/* Organic Background Elements */}
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

      <div className="max-w-5xl mx-auto px-6 py-8 relative z-[1]">
        <div className="space-y-8">
          {/* 欢迎区域 */}
          <div>
            <h1 className="text-2xl font-semibold">欢迎使用 Linksy</h1>
            <p className="text-muted-foreground mt-1">Turn any link into reusable knowledge</p>
          </div>

          {/* 功能入口卡片 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {features.map((feature) => {
              const content = (
                <Card
                  key={feature.title}
                  className={`relative transition-all ${
                    feature.available
                      ? 'hover:shadow-md hover:border-primary/30 cursor-pointer'
                      : 'opacity-60'
                  }`}
                >
                  <CardContent className="flex items-start gap-4 p-5">
                    <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">
                      {feature.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-sm">{feature.title}</h3>
                        {!feature.available && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            即将推出
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{feature.description}</p>
                    </div>
                  </CardContent>
                </Card>
              );

              if (feature.available) {
                return (
                  <Link key={feature.title} href={feature.href} className="block">
                    {content}
                  </Link>
                );
              }
              return <div key={feature.title}>{content}</div>;
            })}
          </div>

          {/* 最近转录 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>最近转录</CardTitle>
                {recentRecords.length > 0 && (
                  <Link href="/transcriptions" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    查看全部
                  </Link>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center items-center h-24">
                  <FlowLoader size="md" />
                </div>
              ) : recentRecords.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recentRecords.map((record) => (
                    <TranscriptionCard
                      key={record.id}
                      record={record}
                      onDeleted={handleRecordDeleted}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">还没有转录记录</p>
                  <Link href="/podcast" className="text-sm text-primary hover:underline mt-2 inline-block">
                    开始第一次转录
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
