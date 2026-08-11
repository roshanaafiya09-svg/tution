import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface ParentCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Lift + shadow-md on hover, for cards that are themselves a link/button. */
  interactive?: boolean;
}

/** The Parent Dashboard's base surface — softer and more elevated than the
 *  shared `Card` (larger radius, warmer resting shadow), mirroring the
 *  Student Dashboard's `AcademicCard` so the parent product reads as its
 *  own calm, premium register without touching the shared primitive the
 *  Tutor/Admin dashboards still rely on. */
export function ParentCard({ children, className, interactive = false, ...props }: ParentCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-sm transition-all duration-base dark:border-neutral-800/80 dark:bg-surface',
        interactive &&
          'cursor-pointer hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md dark:hover:border-neutral-700',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
