import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-shimmer rounded-md bg-[linear-gradient(110deg,theme(colors.neutral.200)8%,theme(colors.neutral.100)18%,theme(colors.neutral.200)33%)] bg-[length:200%_100%] dark:bg-[linear-gradient(110deg,theme(colors.neutral.800)8%,theme(colors.neutral.700)18%,theme(colors.neutral.800)33%)]',
        className,
      )}
      aria-hidden
    />
  );
}

/** A skeleton shaped like a Card, for list/grid loading states. */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-surface',
        className,
      )}
    >
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="mt-3 h-3 w-2/3" />
      <Skeleton className="mt-5 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-5/6" />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} aria-hidden />;
}

/** Centered full-area loading state — replaces bare "Loading…" text. */
export function PageLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-neutral-400 dark:text-neutral-500">
      <Spinner className="h-6 w-6" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
