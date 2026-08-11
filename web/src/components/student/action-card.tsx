import Link from 'next/link';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

const RAIL_TONE = {
  error: 'bg-error',
  warning: 'bg-warning',
  info: 'bg-info',
  brand: 'bg-brand-500',
} as const;

/** A task/priority row with a colored left rail carrying the urgency signal
 *  (error = overdue, warning = due soon, info = scheduled, brand = a
 *  routine action like a quiz). Used on Overview's "What's next" and later
 *  reused for Assignments' priority section. */
export function ActionCard({
  href,
  icon: Icon,
  label,
  meta,
  tone = 'brand',
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  meta?: string;
  tone?: keyof typeof RAIL_TONE;
}) {
  return (
    <Link
      href={href}
      className="group flex items-stretch gap-0 overflow-hidden rounded-xl border border-neutral-200/70 bg-white transition-all duration-base hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-sm dark:border-neutral-800/80 dark:bg-surface dark:hover:border-neutral-700"
    >
      <span className={cn('w-1 shrink-0', RAIL_TONE[tone])} aria-hidden />
      <span className="flex flex-1 items-center gap-3 py-3.5 pl-3.5 pr-4">
        <Icon className="h-4 w-4 shrink-0 text-neutral-400 dark:text-neutral-500" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">{label}</span>
          {meta && <span className="block text-xs text-neutral-400 dark:text-neutral-500">{meta}</span>}
        </span>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-neutral-300 transition-transform duration-fast group-hover:translate-x-0.5 dark:text-neutral-600"
          aria-hidden
        />
      </span>
    </Link>
  );
}
