'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { FlowLoader } from '@/components/ui/flow-loader';
import { ToastManager } from '@/components/ui/toast';
import { parseUrl } from '@/lib/api';
import { Content } from '@/types';
import { detectPlatform } from '@/lib/utils';

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [recentAnalyses, setRecentAnalyses] = useState<Content[]>([
    {
      id: '1',
      url: 'https://youtube.com/watch?v=example1',
      platform: 'youtube',
      title: 'AI 趋势分析',
      description: '2026 年 AI 发展趋势分析',
      duration: 932,
      publishedAt: '2026-03-15'
    },
    {
      id: '2',
      url: 'https://xiaoyuzhoufm.com/episode/example2',
      platform: 'xiaoyuzhou',
      title: '创业者访谈',
      description: '与创业者的深度对话',
      publishedAt: '2026-03-14'
    },
    {
      id: '3',
      url: 'https://xiaohongshu.com/discovery/item/example3',
      platform: 'xiaohongshu',
      title: '效率工具分享',
      description: '提升工作效率的必备工具',
      publishedAt: '2026-03-13'
    }
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    try {
      const result = await parseUrl(url);
      if (result.success && result.data) {
        setRecentAnalyses([result.data, ...recentAnalyses]);
        setUrl('');
        setToast({ message: '分析完成！已提取核心观点', type: 'success' });
        // 跳转到分析结果页
        router.push(`/analysis/${result.data.id}`);
      } else {
        setToast({ message: result.error || '解析失败，请重试', type: 'error' });
      }
    } catch (error) {
      console.error('Error:', error);
      setToast({ message: '网络错误，请检查连接', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const getPlatformIcon = (platform: string) => {
    const icons: Record<string, string> = {
      youtube: '📺',
      xiaoyuzhou: '🎧',
      xiaohongshu: '📕',
      bilibili: '📹'
    };
    return icons[platform] || '📄';
  };

  return (
    <main className="min-h-screen bg-background relative overflow-hidden">
      {/* Flow Background Animation */}
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div className="absolute top-0 -left-1/4 w-96 h-96 bg-primary rounded-full mix-blend-multiply filter blur-3xl animate-flow-bg" />
        <div className="absolute top-0 -right-1/4 w-96 h-96 bg-primary-light rounded-full mix-blend-multiply filter blur-3xl animate-flow-bg" style={{ animationDelay: '1s' }} />
        <div className="absolute -bottom-32 left-1/2 w-96 h-96 bg-secondary rounded-full mix-blend-multiply filter blur-3xl animate-flow-bg" style={{ animationDelay: '2s' }} />
      </div>

      <div className="container max-w-screen-xl mx-auto px-4 py-16 relative z-10">
        <div className="text-center space-y-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-3">
              <span className="text-5xl">🌊</span>
              <h1 className="text-5xl font-bold bg-gradient-to-r from-primary via-primary-light to-primary bg-clip-text text-transparent animate-flow-bg">
                MemoFlow
              </h1>
            </div>
            <p className="text-2xl text-muted-foreground font-light">
              Let Your Ideas Flow
            </p>
            <p className="text-lg text-muted-foreground">
              让灵感如流水般自然流淌
            </p>
          </div>

          {/* Toast 提示 */}
          {toast && (
            <ToastManager
              message={toast.message}
              type={toast.type}
              onClose={() => setToast(null)}
            />
          )}
          
          <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-4">
            <div className="relative">
              <div className="flex">
                <Input
                  type="text"
                  placeholder="粘贴链接，让灵感流淌..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="flex-1 pr-32 rounded-r-none border-border focus:border-primary focus:ring-1 focus:ring-primary focus:ring-offset-0 shadow-none"
                  disabled={loading}
                />
                <Button 
                  type="submit" 
                  className="rounded-l-none bg-gradient-to-r from-primary to-primary-light hover:from-primary-dark hover:to-primary transition-all duration-300 shadow-none"
                  disabled={loading || !url.trim()}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <FlowLoader size="sm" />
                      分析中...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      开始流动
                      <span>→</span>
                    </span>
                  )}
                </Button>
              </div>
            </div>
          </form>

          <div className="pt-16">
            <h2 className="text-2xl font-semibold mb-8">最近分析</h2>
            <div className="space-y-3 max-w-3xl mx-auto">
              {recentAnalyses.map((item) => (
                <Card
                  key={item.id}
                  className="group hover:bg-primary/5 transition-colors duration-200 cursor-pointer border-l-4 border-l-primary"
                  onClick={() => router.push(`/analysis/${item.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-xl">
                          {getPlatformIcon(item.platform)}
                        </div>
                        <div>
                          <h3 className="font-medium text-base group-hover:text-primary transition-colors">
                            {item.title}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {item.platform} • {item.publishedAt}
                            {item.duration && ` • ${Math.floor(item.duration / 60)}:${(item.duration % 60).toString().padStart(2, '0')}`}
                          </p>
                        </div>
                      </div>
                      <span className="text-primary text-sm font-medium flex items-center gap-1">
                        查看
                        <span className="text-xs">→</span>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="pt-16">
            <h2 className="text-2xl font-semibold mb-8">功能特点</h2>
            <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              <Card>
                <CardContent className="p-6 text-center space-y-2">
                  <div className="text-4xl">🧠</div>
                  <h3 className="font-semibold text-lg">AI 分析</h3>
                  <p className="text-muted-foreground">
                    核心观点提取，3-5 个要点总结
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6 text-center space-y-2">
                  <div className="text-4xl">📝</div>
                  <h3 className="font-semibold text-lg">笔记生成</h3>
                  <p className="text-muted-foreground">
                    一键生成笔记，多平台格式适配
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6 text-center space-y-2">
                  <div className="text-4xl">💬</div>
                  <h3 className="font-semibold text-lg">批判思考</h3>
                  <p className="text-muted-foreground">
                    反面观点生成，逻辑漏洞检测
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
