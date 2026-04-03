'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FlowLoader } from '@/components/ui/flow-loader';
import { ToastManager } from '@/components/ui/toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

export default function Home() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // 播客转录相关状态
  const [podcastUrl, setPodcastUrl] = useState('');
  const [podcastLoading, setPodcastLoading] = useState(false);
  const [podcastTranscript, setPodcastTranscript] = useState('');
  const [podcastAudioInfo, setPodcastAudioInfo] = useState<any>(null);

  // 处理播客转录
  const handlePodcastTranscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podcastUrl.trim()) return;

    setPodcastLoading(true);
    setPodcastTranscript('');
    setPodcastAudioInfo(null);

    try {
      // 检查是否为小宇宙链接
      if (!podcastUrl.includes('xiaoyuzhoufm.com')) {
        setToast({ message: '目前仅支持小宇宙播客链接', type: 'error' });
        setPodcastLoading(false);
        return;
      }

      // 调用处理播客的API
      const response = await fetch('/api/process-podcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: podcastUrl }),
      });

      const result = await response.json();

      if (result.success) {
        setPodcastTranscript(result.data.transcript);
        setPodcastAudioInfo({
          audioUrl: result.data.audioUrl,
          wordCount: result.data.wordCount,
          language: result.data.language,
        });
        setToast({ message: '转录成功！', type: 'success' });
      } else {
        setToast({ message: result.error || '转录失败，请重试', type: 'error' });
      }
    } catch (error) {
      console.error('Podcast transcription error:', error);
      setToast({ message: '网络错误，请检查连接', type: 'error' });
    } finally {
      setPodcastLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background relative overflow-hidden">
      {/* Flow Background Animation */}
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div className="absolute top-0 -left-1/4 w-96 h-96 bg-primary rounded-full mix-blend-multiply filter blur-3xl animate-flow-bg" />
        <div className="absolute top-0 -right-1/4 w-96 h-96 bg-primary-light rounded-full mix-blend-multiply filter blur-3xl animate-flow-bg" style={{ animationDelay: '1s' }} />
        <div className="absolute -bottom-32 left-1/2 w-96 h-96 bg-secondary rounded-full mix-blend-multiply filter blur-3xl animate-flow-bg" style={{ animationDelay: '2s' }} />
      </div>

      <div className="container max-w-4xl mx-auto px-4 py-16 relative z-10">
        <div className="text-center space-y-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-3">
              <span className="text-5xl">🌊</span>
              <h1 className="text-5xl font-bold bg-gradient-to-r from-primary via-primary-light to-primary bg-clip-text text-transparent animate-flow-bg">
                MemoFlow
              </h1>
            </div>
            <p className="text-2xl text-muted-foreground font-light">
              播客转录工具
            </p>
            <p className="text-lg text-muted-foreground">
              粘贴小宇宙播客链接，自动转录为文字
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

          {/* 播客转录功能卡 */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>播客转录</CardTitle>
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
                      disabled={podcastLoading}
                    />
                    <Button
                      type="submit"
                      className="bg-gradient-to-r from-primary to-primary-light hover:from-primary-dark hover:to-primary transition-all"
                      disabled={podcastLoading || !podcastUrl.trim()}
                    >
                      {podcastLoading ? (
                        <span className="flex items-center gap-2">
                          <FlowLoader size="sm" />
                          转录中...
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

              {/* 播客转录结果展示 */}
              {(podcastTranscript || podcastAudioInfo) && (
                <div className="mt-6 space-y-6">
                  {podcastAudioInfo && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span>音频信息</span>
                          <div className="flex gap-2">
                            <Badge variant="secondary">{podcastAudioInfo.language}</Badge>
                            <Badge variant="outline">{podcastAudioInfo.wordCount} 字</Badge>
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">🎵</span>
                            <div className="flex-1 min-w-0">
                              <p className="truncate text-sm text-muted-foreground break-all">{podcastAudioInfo.audioUrl}</p>
                            </div>
                          </div>

                          <Separator />

                          <div className="bg-muted p-4 rounded-lg">
                            <audio controls className="w-full">
                              <source src={podcastAudioInfo.audioUrl} type="audio/mpeg" />
                              您的浏览器不支持音频元素。
                            </audio>
                          </div>
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
                        <Tabs defaultValue="plain" className="w-full">
                          <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="plain">纯文本</TabsTrigger>
                            <TabsTrigger value="formatted">格式化</TabsTrigger>
                          </TabsList>
                          <TabsContent value="plain" className="mt-4">
                            <div className="bg-muted p-4 rounded-lg whitespace-pre-wrap leading-relaxed">
                              {podcastTranscript}
                            </div>
                          </TabsContent>
                          <TabsContent value="formatted" className="mt-4">
                            <div className="prose prose-gray max-w-none">
                              <div className="bg-white p-6 rounded-lg border">
                                {podcastTranscript.split('\n\n').map((paragraph, index) => (
                                  <p key={index} className="mb-4 last:mb-0">{paragraph}</p>
                                ))}
                              </div>
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
        </div>
      </div>
    </main>
  );
}
