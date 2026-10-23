import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

export function StatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" role="status" aria-label="Loading stats">
      <Skeleton className="col-span-2 row-span-2 h-44 sm:h-52 rounded-2xl" />
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="col-span-2 h-28 rounded-2xl" />
      <span className="sr-only">Loading statistics…</span>
    </div>
  );
}

export function LeadsTableSkeleton() {
  return (
    <div className="glass-card rounded-2xl overflow-hidden" role="status" aria-label="Loading leads">
      <div className="px-5 py-4 border-b border-border/40 flex justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-5 w-16" />
      </div>
      <div className="divide-y divide-border/30">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="px-5 py-4 flex items-center gap-4">
            <Skeleton className="w-3 h-3 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
            <Skeleton className="h-8 w-20 rounded-lg hidden sm:block" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading leads…</span>
    </div>
  );
}
