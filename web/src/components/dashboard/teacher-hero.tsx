import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type DayPeriod = 'morning' | 'afternoon' | 'evening';

const WASH: Record<DayPeriod, string> = {
  morning: 'from-accent-50 via-white to-brand-50/60 dark:from-accent-500/10 dark:via-transparent dark:to-brand-500/10',
  afternoon: 'from-brand-50/70 via-white to-white dark:from-brand-500/10 dark:via-transparent dark:to-transparent',
  evening:
    'from-brand-100/70 via-brand-50/30 to-white dark:from-brand-500/15 dark:via-brand-500/5 dark:to-transparent',
};

/** Today's signature moment: the greeting and "what am I teaching today"
 *  content merged into one large panel, with a dawn-to-dusk gradient rail
 *  (amber → indigo) mirroring the Student `HeroPanel` / Parent
 *  `ParentHero` pattern so all three dashboards share the same premium
 *  opening beat. */
export function TeacherHero({
  period,
  greeting,
  subtitle,
  children,
}: {
  period: DayPeriod;
  greeting: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex overflow-hidden rounded-3xl border border-neutral-200/70 shadow-md dark:border-neutral-800/80">
      <span
        className="w-1.5 shrink-0 bg-gradient-to-b from-accent-400 via-accent-500 to-brand-500 sm:w-2"
        aria-hidden
      />
      <div className={cn('flex-1 bg-gradient-to-br px-6 py-8 sm:px-10 sm:py-10', WASH[period])}>
        <p className="font-display text-[1.75rem] font-semibold leading-tight text-neutral-900 dark:text-neutral-50 sm:text-4xl">
          {greeting}
        </p>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300 sm:text-base">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}
