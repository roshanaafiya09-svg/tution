import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

const TONE_CLASS = {
  brand: 'text-brand-500 dark:text-brand-300',
  neutral: 'text-neutral-400 dark:text-neutral-500',
  success: 'text-success dark:text-success-dark',
  warning: 'text-warning dark:text-warning-dark',
  error: 'text-error dark:text-error-dark',
} as const;

/** A dense overview tile — smaller than `StatCard` so five of them fit
 *  above the fold without the page turning into a wall of giant numbers.
 *  Give it an `href` and it becomes the entry point to the section the
 *  number came from. */
export function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'brand',
  href,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: keyof typeof TONE_CLASS;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4 shrink-0', TONE_CLASS[tone])} aria-hidden />
        <p className="min-w-0 flex-1 truncate text-xs font-medium uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
          {label}
        </p>
        {href && (
          <ArrowUpRight
            className="h-3.5 w-3.5 shrink-0 text-neutral-300 transition-colors group-hover:text-brand-500 dark:text-neutral-700 dark:group-hover:text-brand-300"
            aria-hidden
          />
        )}
      </div>
      {/* A div, not a <p>: callers pass rich nodes here (a loading
          Skeleton, a styled span), and a block element inside <p> is
          invalid HTML that React reports as a hydration error. */}
      <div className="mt-2.5 font-display text-2xl font-semibold leading-none text-neutral-900 dark:text-neutral-50">
        {value}
      </div>
      {hint && <p className="mt-1.5 truncate text-xs text-neutral-400 dark:text-neutral-500">{hint}</p>}
    </>
  );

  const shell = cn(
    'group rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-sm transition-all duration-base dark:border-neutral-800/80 dark:bg-surface',
    href && 'hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md dark:hover:border-neutral-700',
    className,
  );

  if (href) {
    return (
      <Link href={href} className={cn(shell, 'block focus-visible:outline-none focus-visible:shadow-focus-ring')}>
        {body}
      </Link>
    );
  }

  return <div className={shell}>{body}</div>;
}
