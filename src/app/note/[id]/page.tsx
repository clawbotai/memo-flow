'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function NoteEditPage({ params }: { params: { id: string } }) {
  const [title, setTitle] = useState('AI 趋势分析笔记');
  const [content, setContent] = useState(`# AI 趋势分析

## 核心观点

1. AI 将重塑内容创作行业
   - 自动化写作工具普及
   - 人机协作成为主流

2. 创作者需要掌握 AI 技能
   - 提示词工程
   - AI 工具工作流

3. 内容为王依然成立
   - 独特视角不可替代
   - 情感连接是关键

## 我的思考

在这里编辑你的思考...

## 行动清单

- [ ] 学习提示词工程
- [ ] 尝试 AI 写作工具
- [ ] 建立 AI 工作流
`);

  const handleExport = (platform: string) => {
    // TODO: 实现多平台格式导出
    console.log('Export to:', platform);
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" className="hover:bg-primary/10">
              ← 返回
            </Button>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-light bg-clip-text text-transparent">
                📝 编辑笔记
              </h1>
              <p className="text-sm text-muted-foreground">
                让灵感流淌到笔尖
              </p>
            </div>
          </div>
          <Button className="bg-gradient-to-r from-primary to-primary-light hover:from-primary-dark hover:to-primary transition-all duration-300">
            🚀 发布
          </Button>
        </div>

        {/* Title */}
        <div className="mb-6 group">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full text-3xl font-bold bg-transparent border-b-2 border-border focus:border-primary focus:outline-none transition-colors px-2 py-3"
            placeholder="笔记标题..."
          />
        </div>

        {/* Editor */}
        <div className="mb-8">
          <Card className="border-l-4 border-l-primary hover:shadow-lg transition-shadow duration-300">
            <CardContent className="p-0">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full h-[600px] p-6 bg-transparent border-none focus:outline-none resize-none font-mono text-sm"
                placeholder="在这里编辑笔记内容，让灵感自然流淌..."
              />
            </CardContent>
          </Card>
        </div>

        {/* Export Options */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span>📤</span> 导出格式
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button 
              variant="outline" 
              onClick={() => handleExport('xiaohongshu')}
              className="h-auto py-4 flex flex-col items-center gap-2 hover:bg-primary/10 hover:border-primary transition-all duration-300"
            >
              <span className="text-3xl">📕</span>
              <span className="text-sm">小红书</span>
            </Button>
            <Button 
              variant="outline" 
              onClick={() => handleExport('wechat')}
              className="h-auto py-4 flex flex-col items-center gap-2 hover:bg-primary/10 hover:border-primary transition-all duration-300"
            >
              <span className="text-3xl">💬</span>
              <span className="text-sm">公众号</span>
            </Button>
            <Button 
              variant="outline" 
              onClick={() => handleExport('zhihu')}
              className="h-auto py-4 flex flex-col items-center gap-2 hover:bg-primary/10 hover:border-primary transition-all duration-300"
            >
              <span className="text-3xl">📖</span>
              <span className="text-sm">知乎</span>
            </Button>
            <Button 
              variant="outline" 
              onClick={() => handleExport('pdf')}
              className="h-auto py-4 flex flex-col items-center gap-2 hover:bg-primary/10 hover:border-primary transition-all duration-300"
            >
              <span className="text-3xl">📄</span>
              <span className="text-sm">PDF</span>
            </Button>
          </div>
        </div>

        {/* AI Suggestions */}
        <div>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span>💡</span> AI 建议
          </h2>
          <Card className="border-l-4 border-l-primary bg-gradient-to-br from-primary/5 to-primary-light/5">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-primary/10 transition-colors">
                <span className="text-2xl">🎯</span>
                <div>
                  <h3 className="font-medium">标题优化</h3>
                  <p className="text-sm text-muted-foreground">
                    建议：添加数字或情绪词，如"3 个 AI 趋势，创作者必看！"
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-primary/10 transition-colors">
                <span className="text-2xl">🏷️</span>
                <div>
                  <h3 className="font-medium">标签建议</h3>
                  <p className="text-sm text-muted-foreground">
                    #AI #内容创作 #效率工具 #创作者经济
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-primary/10 transition-colors">
                <span className="text-2xl">📈</span>
                <div>
                  <h3 className="font-medium">发布建议</h3>
                  <p className="text-sm text-muted-foreground">
                    最佳发布时间：晚上 20:00-22:00
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
