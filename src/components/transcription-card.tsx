'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TranscriptionRecord } from '@/types/transcription-history';
import { removeCachedTranscriptionRecord } from '@/lib/transcription-browser-cache';

interface TranscriptionCardProps {
  record: TranscriptionRecord;
  onDeleted?: (recordId: string) => void;
}

const TranscriptionCard: React.FC<TranscriptionCardProps> = ({ record, onDeleted }) => {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'transcribing':
        return 'bg-blue-500';
      case 'fetching_info':
      case 'downloading_audio':
      case 'converting':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'idle':
        return '待开始';
      case 'fetching_info':
        return '获取信息中';
      case 'downloading_audio':
        return '下载音频中';
      case 'converting':
        return '转换格式中';
      case 'transcribing':
        return '转录中';
      case 'completed':
        return '已完成';
      case 'error':
        return '错误';
      default:
        return status;
    }
  };

  const handleDelete = async () => {
    if (deleting) {
      return;
    }

    setDeleting(true);
    setDeleteError('');

    try {
      const response = await fetch(`/api/transcription-history?id=${record.id}`, {
        method: 'DELETE',
      });
      const result = await response.json();

      if (!result.success && result.error !== '转录记录不存在') {
        setDeleteError(result.error || '删除失败，请重试');
        return;
      }

      removeCachedTranscriptionRecord(record.id);
      setDeleteOpen(false);

      if (onDeleted) {
        onDeleted(record.id);
      } else {
        router.refresh();
      }
    } catch (error) {
      console.error('删除转录记录失败:', error);
      setDeleteError('删除失败，请检查网络后重试');
    } finally {
      setDeleting(false);
    }
  };

  const isActiveTask = ['fetching_info', 'downloading_audio', 'converting', 'transcribing'].includes(record.status);

  return (
    <>
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <Badge variant="secondary" className={`${getStatusColor(record.status)} text-white`}>
              {getStatusText(record.status)}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              aria-label={`删除 ${record.title}`}
              onClick={() => {
                setDeleteError('');
                setDeleteOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <Link href={`/transcriptions/${record.id}`} className="block">
            <CardTitle className="text-base font-bold leading-snug transition-colors hover:text-primary">
              {record.title}
            </CardTitle>
          </Link>
        </CardHeader>
        <CardContent>
          <Link href={`/transcriptions/${record.id}`} className="block">
            <div className="space-y-2">
              {record.progress !== null && record.progress < 100 && (
                <div>
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                    <span>进度</span>
                    <span>{record.progress}%</span>
                  </div>
                  <Progress value={record.progress} />
                </div>
              )}

              {record.wordCount !== undefined && record.wordCount > 0 && (
                <div className="text-sm text-muted-foreground">
                  {record.wordCount} 字
                </div>
              )}

              <div className="mt-2 text-xs text-muted-foreground">
                {new Date(record.updatedAt).toLocaleString('zh-CN')}
              </div>
            </div>
          </Link>
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={(open) => !deleting && setDeleteOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除转录记录</DialogTitle>
            <DialogDescription>
              {isActiveTask
                ? '该转录任务正在执行。删除时会先停止任务，再删除历史记录和已保存的转录目录。'
                : '删除后会移除历史记录，并删除已保存的转录目录。'}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm">
            <div className="font-medium">{record.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              此操作不可撤销。
            </div>
          </div>

          {deleteError && (
            <p className="text-sm text-destructive">{deleteError}</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? '删除中...' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TranscriptionCard;
