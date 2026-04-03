'use client';

import { cn } from '@/lib/utils';

interface FlowLoaderProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function FlowLoader({ className, size = 'md' }: FlowLoaderProps) {
  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-16 h-16',
    lg: 'w-24 h-24'
  };

  const barSizes = {
    sm: 'w-1',
    md: 'w-1.5',
    lg: 'w-2'
  };

  return (
    <div className={cn('flex items-center justify-center gap-1', className)}>
      <div
        className={cn(
          'rounded-full bg-gradient-to-b from-primary to-primary-light animate-flow-bounce',
          barSizes[size]
        )}
        style={{
          height: size === 'sm' ? '16px' : size === 'md' ? '32px' : '48px',
          animationDelay: '0ms'
        }}
      />
      <div
        className={cn(
          'rounded-full bg-gradient-to-b from-primary to-primary-light animate-flow-bounce',
          barSizes[size]
        )}
        style={{
          height: size === 'sm' ? '16px' : size === 'md' ? '32px' : '48px',
          animationDelay: '150ms'
        }}
      />
      <div
        className={cn(
          'rounded-full bg-gradient-to-b from-primary to-primary-light animate-flow-bounce',
          barSizes[size]
        )}
        style={{
          height: size === 'sm' ? '16px' : size === 'md' ? '32px' : '48px',
          animationDelay: '300ms'
        }}
      />
    </div>
  );
}
