import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

const TONE_BG = {
  brand: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
  warning: 'bg-warning-bg text-warning dark:bg-warning/15 dark:text-warning-dark',
  error: 'bg-error-bg text-error dark:bg-error/15 dark:text-error-dark',
  info: 'bg-info-bg text-info dark:bg-info/15 dark:text-info-dark',
  success: 'bg-success-bg text-success dark:bg-success/15 dark:text-success-dark',
} as const;

export interface ActivityItem {
  id: string;
  icon: LucideIcon;
  tone?: keyof typeof TONE_BG;
  title: string;
  detail?: string;
  timestamp: string;
  href?: string;
  unread?: boolean;
}

/** A lightweight feed of real events sourced from `/notifications` —
 *  mirrors Parent's `ActivityFeed`. */
export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200/70 bg-white shadow-sm dark:divide-neutral-800/80 dark:border-neutral-800/80 dark:bg-surface">
      {items.map((item) => {
        const row = (
          <div className="flex items-start gap-3 px-5 py-3.5">
            <div
              className={cn(
                'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                TONE_BG[item.tone ?? 'brand'],
              )}
            >
              <item.icon className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-medium text-neutral-900 dark:text-neutral-50">
                {item.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />}
                <span className="truncate">{item.title}</span>
              </p>
              {item.detail && <p className="mt-0.5 truncate text-sm text-neutral-600 dark:text-neutral-400">{item.detail}</p>}
              <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                {new Date(item.timestamp).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
        );

        if (item.href) {
          return (
            <Link
              key={item.id}
              href={item.href}
              className="block transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
            >
              {row}
            </Link>
          );
        }
        return <div key={item.id}>{row}</div>;
      })}
    </div>
  );
}
