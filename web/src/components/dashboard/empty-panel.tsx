import type { ReactNode } from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

/** The Teacher Portal's page-level empty state: compact by design so an
 *  empty page never reads as a broken one. A small icon, one heading, one
 *  explaining line, a primary action, and — for multi-step setups — a
 *  short numbered path forward. Use `TeacherEmptyState` for the quieter
 *  in-section variant. */
export function EmptyPanel({
  icon: Icon = Inbox,
  title,
  description,
  action,
  steps,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  /** Optional "what happens next" path — kept inline so it costs one short
   *  row rather than a second card. */
  steps?: string[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-dashed border-neutral-300 bg-neutral-50/60 px-5 py-6 dark:border-neutral-700/70 dark:bg-neutral-900/40 sm:px-6',
        className,
      )}
    >
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-neutral-400 shadow-xs dark:bg-neutral-900 dark:text-neutral-500">
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">{title}</p>
          <p className="mt-1 max-w-xl text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
          {steps && steps.length > 0 && (
            <ol className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2">
              {steps.map((step, index) => (
                <li
                  key={step}
                  className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-neutral-500 shadow-xs dark:bg-neutral-900 dark:text-neutral-400">
                    {index + 1}
                  </span>
                  {step}
                  {index < steps.length - 1 && (
                    <span className="ml-1 text-neutral-300 dark:text-neutral-700" aria-hidden>
                      →
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
          {action && <div className="mt-4 flex flex-wrap gap-2">{action}</div>}
        </div>
      </div>
    </div>
  );
}
