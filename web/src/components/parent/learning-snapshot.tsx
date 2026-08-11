import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const TONE_CLASS = {
  brand: 'text-brand-500 dark:text-brand-300',
  success: 'text-success dark:text-success-dark',
  warning: 'text-warning dark:text-warning-dark',
  error: 'text-error dark:text-error-dark',
} as const;

export interface SnapshotStat {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  tone?: keyof typeof TONE_CLASS;
  detail?: string;
}

/** A continuous metrics strip for a child's real attendance/assignment/quiz
 *  rates — internal dividers, not separate boxes. Categories with no data
 *  are simply never passed in, never rendered as a fabricated "—". */
export function LearningSnapshot({ stats }: { stats: SnapshotStat[] }) {
  if (stats.length === 0) return null;

  return (
    <div
      className={cn(
        'flex flex-col divide-y divide-neutral-200/70 overflow-hidden rounded-2xl border border-neutral-200/70 bg-white shadow-sm dark:divide-neutral-800/80 dark:border-neutral-800/80 dark:bg-surface sm:flex-row sm:divide-x sm:divide-y-0',
      )}
    >
      {stats.map((s) => (
        <div key={s.label} className="flex flex-1 items-start gap-3 p-5">
          <s.icon className={cn('mt-0.5 h-[18px] w-[18px] shrink-0', TONE_CLASS[s.tone ?? 'brand'])} aria-hidden />
          <div className="min-w-0">
            <p className="font-display text-2xl font-semibold leading-none text-neutral-900 dark:text-neutral-50">
              {s.value}
            </p>
            <p className="mt-1.5 text-sm font-medium text-neutral-500 dark:text-neutral-400">{s.label}</p>
            {s.detail && <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">{s.detail}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
