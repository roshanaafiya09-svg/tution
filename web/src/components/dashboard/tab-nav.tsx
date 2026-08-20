'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
  /** Small trailing count, e.g. "12" next to Students. */
  count?: number;
}

/** The Teacher Portal's underline tab strip — one implementation shared by
 *  batch detail and student detail so both scroll, wrap, and highlight the
 *  same way on every screen size. */
export function TabNav<T extends string>({
  tabs,
  value,
  onChange,
  className,
  label = 'Sections',
}: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        'flex gap-1 overflow-x-auto border-b border-neutral-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-neutral-800',
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:shadow-focus-ring sm:px-4',
              active
                ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-200'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100',
            )}
          >
            {tab.icon && <tab.icon className="h-4 w-4" aria-hidden />}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                  active
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200'
                    : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
