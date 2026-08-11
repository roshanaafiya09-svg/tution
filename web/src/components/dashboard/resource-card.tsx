import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { AcademicCard } from './academic-card';

const TONE_BG = {
  brand: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
  accent: 'bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300',
  info: 'bg-info-bg text-info dark:bg-info/15 dark:text-info-dark',
  success: 'bg-success-bg text-success dark:bg-success/15 dark:text-success-dark',
  warning: 'bg-warning-bg text-warning dark:bg-warning/15 dark:text-warning-dark',
} as const;

/** A library tile — icon-forward resource card for Materials. Mirrors
 *  Student's `ResourceCard`. */
export function ResourceCard({
  icon: Icon,
  tone = 'brand',
  title,
  meta,
  action,
}: {
  icon: LucideIcon;
  tone?: keyof typeof TONE_BG;
  title: string;
  meta: string;
  action?: React.ReactNode;
}) {
  return (
    <AcademicCard className="flex flex-col gap-4">
      <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', TONE_BG[tone])}>
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-neutral-900 dark:text-neutral-50">{title}</p>
        <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{meta}</p>
      </div>
      {action}
    </AcademicCard>
  );
}
