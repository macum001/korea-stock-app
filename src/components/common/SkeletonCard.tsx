// jp: 스켈레톤 로딩 컴포넌트

import { cn } from '@/utils/format';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-lg',
        className
      )}
      style={{ backgroundColor: 'var(--bg-elevated)' }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="p-4 rounded-2xl" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-3 mb-3">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="text-right">
          <Skeleton className="h-5 w-20 mb-2" />
          <Skeleton className="h-3 w-14" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonStockDetail() {
  return (
    <div className="px-4 pt-4">
      <Skeleton className="h-6 w-32 mb-2" />
      <Skeleton className="h-10 w-48 mb-1" />
      <Skeleton className="h-5 w-28 mb-6" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}
