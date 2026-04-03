'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { TranscriptionRecord } from '@/types/transcription-history';

interface TranscriptionCardProps {
  record: TranscriptionRecord;
}

const TranscriptionCard: React.FC<TranscriptionCardProps> = ({ record }) => {
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

  return (
    <Link href={`/transcriptions/${record.id}`} className="block">
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardHeader className="pb-2">
          <div className="flex justify-end mb-1">
            <Badge variant="secondary" className={`${getStatusColor(record.status)} text-white`}>
              {getStatusText(record.status)}
            </Badge>
          </div>
          <CardTitle className="text-base font-bold leading-snug">{record.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {record.progress !== null && record.progress < 100 && (
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
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

            <div className="text-xs text-muted-foreground mt-2">
              {new Date(record.updatedAt).toLocaleString('zh-CN')}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};

export default TranscriptionCard;