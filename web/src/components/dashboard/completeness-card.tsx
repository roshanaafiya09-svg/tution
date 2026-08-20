import type { ReactNode } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface CompletenessItem {
  key: string;
  label: string;
  done: boolean;
  /** Where the teacher goes to finish this item. */
  href?: string;
}

/** "Your profile is 70% complete" — the shared progress + checklist block
 *  behind both Teacher Profile and Marketplace readiness. Every item is
 *  derived from real saved state by the caller; nothing here invents a
 *  completion signal. */
export function CompletenessCard({
  title,
  items,
  action,
  description,
  className,
}: {
  title: string;
  items: CompletenessItem[];
  action?: ReactNode;
  description?: string;
  className?: string;
}) {
  const done = items.filter((item) => item.done).length;
  const percent = items.length === 0 ? 0 : Math.round((done / items.length) * 100);

  return (
    <div
      className={cn(
        'rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-sm dark:border-neutral-800/80 dark:bg-surface sm:p-6',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">{title}</p>
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
            {percent === 100 ? 'Complete — nothing left to add.' : `${percent}% complete`}
            {description ? ` · ${description}` : ''}
          </p>
        </div>
        {action}
      </div>

      <div
        className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={title}
      >
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-slow dark:bg-brand-400"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {items.map((item) => {
          const content = (
            <>
              <span
                className={cn(
                  'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border',
                  item.done
                    ? 'border-success bg-success-bg text-success dark:border-success-dark/40 dark:bg-success/15 dark:text-success-dark'
                    : 'border-neutral-300 text-transparent dark:border-neutral-700',
                )}
                aria-hidden
              >
                <Check className="h-2.5 w-2.5" />
              </span>
              <span
                className={cn(
                  'min-w-0 truncate',
                  item.done
                    ? 'text-neutral-500 dark:text-neutral-400'
                    : 'font-medium text-neutral-700 dark:text-neutral-200',
                )}
              >
                {item.label}
              </span>
            </>
          );

          return (
            <li key={item.key}>
              {item.href && !item.done ? (
                <Link
                  href={item.href}
                  className="flex items-center gap-2 rounded-md text-sm transition-colors hover:text-brand-700 dark:hover:text-brand-300"
                >
                  {content}
                </Link>
              ) : (
                <span className="flex items-center gap-2 text-sm">{content}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
