import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** A single continuous metrics strip (internal dividers, not separate
 *  boxes) — the "how's my teaching going" band on Today and other stat
 *  rows. Mirrors Student's `StatBand`/`StatBandItem`. */
export function StatBand({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col divide-y divide-neutral-200/70 overflow-hidden rounded-2xl border border-neutral-200/70 bg-white shadow-sm dark:divide-neutral-800/80 dark:border-neutral-800/80 dark:bg-surface sm:flex-row sm:divide-x sm:divide-y-0',
        className,
      )}
    >
      {children}
    </div>
  );
}

const TONE_CLASS = {
  brand: 'text-brand-500 dark:text-brand-300',
  success: 'text-success dark:text-success-dark',
  warning: 'text-warning dark:text-warning-dark',
  error: 'text-error dark:text-error-dark',
} as const;

export function StatBandItem({
  icon: Icon,
  label,
  value,
  tone = 'brand',
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  tone?: keyof typeof TONE_CLASS;
  detail?: string;
}) {
  return (
    <div className="flex flex-1 items-start gap-3 p-5">
      <Icon className={cn('mt-0.5 h-[18px] w-[18px] shrink-0', TONE_CLASS[tone])} aria-hidden />
      <div className="min-w-0">
        <p className="font-display text-2xl font-semibold leading-none text-neutral-900 dark:text-neutral-50">
          {value}
        </p>
        <p className="mt-1.5 text-sm font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
        {detail && <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">{detail}</p>}
      </div>
    </div>
  );
}
