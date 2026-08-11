import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** A roster row for a batch's Students tab — identity plus whatever real
 *  context is available (attendance, status), and any row actions. */
export function StudentCard({
  name,
  meta,
  badge,
  action,
  className,
}: {
  name: string;
  meta?: string;
  badge?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-5 py-3.5',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold uppercase text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
          aria-hidden
        >
          {name.slice(0, 2)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">{name}</p>
          {meta && <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">{meta}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {action}
        {badge}
      </div>
    </div>
  );
}
