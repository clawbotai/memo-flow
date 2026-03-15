'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { parseUrl } from '@/lib/api';
import { Content } from '@/types';
import { detectPlatform } from '@/lib/utils';

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
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
        // TODO: 跳转到分析结果页
        // router.push(`/analysis/${result.data.id}`);
      }
    } catch (error) {
      console.error('Error:', error);
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
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              🧠 MemoFlow
            </h1>
            <p className="text-xl text-muted-foreground">
              AI 驱动的内容分析与创作助手
            </p>
            <p className="text-lg text-muted-foreground">
              让灵感自然流淌
            </p>
          </div>
          
          <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-4">
            <div className="relative">
              <Input
                type="text"
                placeholder="粘贴 YouTube/小宇宙/小红书链接..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="pr-32"
                disabled={loading}
              />
              <Button 
                type="submit" 
                className="absolute right-1 top-1 h-9"
                disabled={loading || !url.trim()}
              >
                {loading ? '分析中...' : '开始分析'}
              </Button>
            </div>
          </form>

          <div className="pt-16">
            <h2 className="text-2xl font-semibold mb-8">最近分析</h2>
            <div className="space-y-4 max-w-3xl mx-auto">
              {recentAnalyses.map((item) => (
                <Card 
                  key={item.id}
                  className="hover:border-primary/50 transition-colors cursor-pointer"
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">
                          {getPlatformIcon(item.platform)}
                        </span>
                        <div>
                          <h3 className="font-medium">{item.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            {item.platform} • {item.publishedAt}
                            {item.duration && ` • ${Math.floor(item.duration / 60)}:${(item.duration % 60).toString().padStart(2, '0')}`}
                          </p>
                        </div>
                      </div>
                      <span className="text-primary font-medium">
                        查看 →
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
