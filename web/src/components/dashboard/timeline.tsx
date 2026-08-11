import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** A node on a vertical timeline rail — a marker plus a connecting line
 *  down to the next node, for chronological session/schedule lists.
 *  Mirrors Student's `TimelineNode`/`TimelineDot`. */
export function TimelineItem({
  children,
  marker,
  isLast = false,
}: {
  children: ReactNode;
  marker?: ReactNode;
  isLast?: boolean;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex w-3 shrink-0 flex-col items-center">
        {marker ?? <TimelineDot />}
        {!isLast && <span className="mt-1 w-px flex-1 bg-neutral-200 dark:bg-neutral-800" aria-hidden />}
      </div>
      <div className="flex-1 pb-6">{children}</div>
    </div>
  );
}

export function TimelineDot({ active = false }: { active?: boolean }) {
  return (
    <span
      className={cn(
        'mt-1.5 h-3 w-3 shrink-0 rounded-full border-2',
        active
          ? 'border-brand-500 bg-brand-500 shadow-[0_0_0_4px_theme(colors.brand.100)] dark:shadow-[0_0_0_4px_theme(colors.brand.500/0.2)]'
          : 'border-neutral-300 bg-white dark:border-neutral-700 dark:bg-surface',
      )}
      aria-hidden
    />
  );
}
