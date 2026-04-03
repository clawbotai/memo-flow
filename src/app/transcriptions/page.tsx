import { getAllTranscriptionRecords } from '@/lib/transcription-history';
import TranscriptionCard from '@/components/transcription-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FlowLoader } from '@/components/ui/flow-loader';
import { Suspense } from 'react';

async function TranscriptionListContent() {
  const records = await getAllTranscriptionRecords();

  return (
    <div className="space-y-6">
      {records.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {records.map((record) => (
            <TranscriptionCard key={record.id} record={record} />
          ))}
        </div>
      ) : (
        <p className="text-center text-muted-foreground py-8">暂无转录记录</p>
      )}
    </div>
  );
}

export default function TranscriptionsPage() {
  return (
    <div className="min-h-full bg-background relative overflow-hidden">
      {/* Organic Background Elements */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        {/* Leaf/flower-like organic shapes */}
        <div className="absolute top-10 left-10 w-32 h-32 rounded-full bg-primary/10 blur-xl rotate-12"></div>
        <div className="absolute top-40 right-20 w-24 h-24 rounded-full bg-secondary/15 blur-lg -rotate-45"></div>
        <div className="absolute bottom-40 left-1/4 w-40 h-40 rounded-full bg-primary/5 blur-2xl rotate-45"></div>
        <div className="absolute bottom-20 right-1/3 w-28 h-28 rounded-full bg-primary-light/10 blur-xl rotate-30"></div>

        {/* Organic flowing lines */}
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

      <div className="max-w-5xl mx-auto px-6 py-8 relative z-10">
        <div className="space-y-8">
          {/* 页面标题 */}
          <div>
            <h1 className="text-2xl font-semibold">我的转录</h1>
            <p className="text-muted-foreground mt-1">查看和管理您的转录历史</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>转录历史</CardTitle>
            </CardHeader>
            <CardContent>
              <Suspense
                fallback={
                  <div className="flex justify-center items-center h-32">
                    <FlowLoader size="md" />
                  </div>
                }
              >
                <TranscriptionListContent />
              </Suspense>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}