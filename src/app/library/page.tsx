'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function LibraryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  const notes = [
    {
      id: '1',
      title: 'AI 趋势分析',
      platform: 'youtube',
      date: '2026-03-15',
      viewpoints: 3,
      tags: ['#AI', '#趋势']
    },
    {
      id: '2',
      title: '创业者访谈',
      platform: 'xiaoyuzhou',
      date: '2026-03-14',
      viewpoints: 5,
      tags: ['#创业', '#访谈']
    },
    {
      id: '3',
      title: '效率工具分享',
      platform: 'xiaohongshu',
      date: '2026-03-13',
      viewpoints: 4,
      tags: ['#效率', '#工具']
    },
    {
      id: '4',
      title: 'B 站技术分享',
      platform: 'bilibili',
      date: '2026-03-12',
      viewpoints: 2,
      tags: ['#技术']
    },
    {
      id: '5',
      title: '播客节目笔记',
      platform: 'xiaoyuzhou',
      date: '2026-03-11',
      viewpoints: 6,
      tags: ['#商业']
    },
    {
      id: '6',
      title: '小红书笔记',
      platform: 'xiaohongshu',
      date: '2026-03-10',
      viewpoints: 3,
      tags: ['#生活']
    }
  ];

  const getPlatformIcon = (platform: string) => {
    const icons: Record<string, string> = {
      youtube: '📺',
      xiaoyuzhou: '🎧',
      xiaohongshu: '📕',
      bilibili: '📹'
    };
    return icons[platform] || '📄';
  };

  const filteredNotes = notes.filter(note => {
    const matchesSearch = note.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = activeFilter === 'all' || note.platform === activeFilter;
    return matchesSearch && matchesFilter;
  });

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">📚 知识库</h1>
            <p className="text-muted-foreground mt-1">
              管理你的所有分析和笔记
            </p>
          </div>
          <Button>
            ➕ 新建
          </Button>
        </div>

        {/* Search and Filters */}
        <div className="mb-8 space-y-4">
          <div className="flex gap-4">
            <Input
              type="text"
              placeholder="🔍 搜索笔记..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-md"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={activeFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveFilter('all')}
            >
              全部
            </Button>
            <Button
              variant={activeFilter === 'youtube' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveFilter('youtube')}
            >
              📺 视频
            </Button>
            <Button
              variant={activeFilter === 'xiaoyuzhou' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveFilter('xiaoyuzhou')}
            >
              🎧 播客
            </Button>
            <Button
              variant={activeFilter === 'xiaohongshu' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveFilter('xiaohongshu')}
            >
              📕 图文
            </Button>
          </div>
        </div>

        {/* Notes Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredNotes.map((note) => (
            <Card 
              key={note.id}
              className="hover:border-primary/50 transition-colors cursor-pointer group"
            >
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <span className="text-4xl">
                    {getPlatformIcon(note.platform)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {note.date}
                  </span>
                </div>
                
                <div>
                  <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors">
                    {note.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {note.viewpoints} 个观点
                  </p>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {note.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="pt-4 flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1">
                    查看
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1">
                    编辑
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Empty State */}
        {filteredNotes.length === 0 && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📭</div>
            <h3 className="text-xl font-semibold mb-2">暂无笔记</h3>
            <p className="text-muted-foreground mb-4">
              粘贴链接开始分析，创建你的第一篇笔记
            </p>
            <Button>
              开始分析
            </Button>
          </div>
        )}

        {/* Stats */}
        <div className="mt-16 grid md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6 text-center">
              <div className="text-3xl font-bold text-primary mb-1">
                {notes.length}
              </div>
              <p className="text-sm text-muted-foreground">总笔记数</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <div className="text-3xl font-bold text-primary mb-1">
                {notes.reduce((acc, note) => acc + note.viewpoints, 0)}
              </div>
              <p className="text-sm text-muted-foreground">总观点数</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <div className="text-3xl font-bold text-primary mb-1">
                {new Set(notes.flatMap(n => n.tags)).size}
              </div>
              <p className="text-sm text-muted-foreground">标签数</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <div className="text-3xl font-bold text-primary mb-1">
                {new Set(notes.map(n => n.platform)).size}
              </div>
              <p className="text-sm text-muted-foreground">支持平台</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
