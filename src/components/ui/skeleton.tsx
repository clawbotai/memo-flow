import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'title' | 'card' | 'circle';
}

export function Skeleton({ className, variant = 'text' }: SkeletonProps) {
  const variants = {
    text: 'h-4 w-full',
    title: 'h-8 w-3/4',
    card: 'h-32 w-full rounded-lg',
    circle: 'h-12 w-12 rounded-full'
  };

  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-muted',
        variants[variant],
        className
      )}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Skeleton variant="circle" className="w-12 h-12" />
        <div className="space-y-2 flex-1">
          <Skeleton variant="title" className="h-6 w-3/4" />
          <Skeleton variant="text" className="h-4 w-1/2" />
        </div>
      </div>
    </div>
  );
}

export function ViewpointSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-3 p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            <Skeleton variant="circle" className="w-8 h-8" />
            <Skeleton variant="title" className="h-6 w-2/3" />
          </div>
          <div className="space-y-2 ml-11">
            <Skeleton variant="text" />
            <Skeleton variant="text" />
          </div>
        </div>
      ))}
    </div>
  );
}
