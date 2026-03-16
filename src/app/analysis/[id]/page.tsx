'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Viewpoint, Controversy } from '@/types';

export default function AnalysisPage({ params }: { params: { id: string } }) {
  const [expandedTranscript, setExpandedTranscript] = useState(false);

  // TODO: 从 API 获取实际数据
  const mockViewpoints: Viewpoint[] = [
    {
      id: 'v1',
      title: 'AI 将重塑内容创作行业',
      arguments: ['自动化写作工具普及', '人机协作成为主流']
    },
    {
      id: 'v2',
      title: '创作者需要掌握 AI 技能',
      arguments: ['提示词工程', 'AI 工具工作流']
    },
    {
      id: 'v3',
      title: '内容为王依然成立',
      arguments: ['独特视角不可替代', '情感连接是关键']
    }
  ];

  const mockControversies: Controversy[] = [
    {
      id: 'c1',
      topic: 'AI 会取代创作者吗？',
      pro: '会取代重复性工作',
      con: '创造力无法替代'
    }
  ];

  const mockTranscript = `
00:00 大家好，今天我们聊聊 AI 对内容创作的影响
00:15 首先说结论，AI 会重塑内容创作行业，但不会完全取代创作者
00:30 第一点，自动化写作工具正在普及，很多基础内容可以由 AI 生成
00:45 第二点，人机协作成为主流，创作者需要学会使用 AI 工具
01:00 第三点，内容为王依然成立，独特视角和情感连接是 AI 无法替代的
01:15 最后，创作者需要掌握 AI 技能，包括提示词工程和 AI 工具工作流
01:30 谢谢大家
  `.trim();

  return (
    <main className="min-h-screen bg-background relative">
      {/* Flow Background */}
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div className="absolute top-0 -left-1/4 w-96 h-96 bg-primary rounded-full mix-blend-multiply filter blur-3xl animate-flow-bg" />
      </div>

      <div className="container max-w-screen-xl mx-auto px-4 py-8 relative z-10">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" className="hover:bg-primary/10">
              ← 返回
            </Button>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-light bg-clip-text text-transparent">
                AI 趋势分析
              </h1>
              <p className="text-sm text-muted-foreground">
                📺 YouTube • 2026-03-15 • 15:32
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="hover:bg-primary/10 hover:border-primary">
            📤 分享
          </Button>
        </div>

        {/* Viewpoints */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span>💡</span> 核心观点 ({mockViewpoints.length})
          </h2>
          <div className="space-y-4">
            {mockViewpoints.map((vp, index) => (
              <Card 
                key={vp.id}
                className="group border-l-4 border-l-primary hover:shadow-lg hover:border-primary/50 transition-all duration-300"
              >
                <CardContent className="p-6 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary-light/20 flex items-center justify-center text-sm font-bold text-primary">
                      {index + 1}
                    </div>
                    <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
                      {vp.title}
                    </h3>
                  </div>
                  <ul className="space-y-2 text-muted-foreground ml-11">
                    {vp.arguments.map((arg, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>{arg}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Controversies */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span>⚠️</span> 争议点 ({mockControversies.length})
          </h2>
          <div className="space-y-4">
            {mockControversies.map((c) => (
              <Card key={c.id} className="hover:shadow-lg transition-shadow duration-300">
                <CardContent className="p-6 space-y-4">
                  <h3 className="font-semibold text-lg">{c.topic}</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/20 hover:border-green-500/40 transition-colors">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-green-500">✅</span>
                        <div className="font-medium text-green-500">正方</div>
                      </div>
                      <p className="text-sm text-muted-foreground">{c.pro}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-gradient-to-br from-red-500/10 to-red-500/5 border border-red-500/20 hover:border-red-500/40 transition-colors">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-red-500">❌</span>
                        <div className="font-medium text-red-500">反方</div>
                      </div>
                      <p className="text-sm text-muted-foreground">{c.con}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Transcript */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <span>📝</span> 逐字稿
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpandedTranscript(!expandedTranscript)}
              className="hover:bg-primary/10"
            >
              {expandedTranscript ? '收起' : '展开'}
            </Button>
          </div>
          <Card className="border-l-4 border-l-primary">
            <CardContent className="p-6">
              <pre className={`text-sm text-muted-foreground whitespace-pre-wrap font-mono ${
                expandedTranscript ? '' : 'line-clamp-3'
              }`}>
                {mockTranscript}
              </pre>
            </CardContent>
          </Card>
        </section>

        {/* Actions */}
        <div className="flex gap-4 sticky bottom-4 bg-background/80 backdrop-blur-sm p-4 rounded-lg border border-border">
          <Button className="flex-1 bg-gradient-to-r from-primary to-primary-light hover:from-primary-dark hover:to-primary transition-all duration-300">
            📝 生成笔记
          </Button>
          <Button variant="outline" className="flex-1 hover:bg-primary/10 hover:border-primary">
            📋 生成大纲
          </Button>
          <Button variant="outline" className="hover:bg-primary/10 hover:border-primary">
            📄 导出 PDF
          </Button>
        </div>
      </div>
    </main>
  );
}
