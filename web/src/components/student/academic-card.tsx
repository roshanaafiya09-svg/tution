import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface AcademicCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Lift + shadow-md on hover, for cards that are themselves a link/button. */
  interactive?: boolean;
}

/** The Student Dashboard's base surface. Softer and more elevated than the
 *  shared `Card` (larger radius, shadow-sm resting instead of shadow-xs) so
 *  the student product reads as its own warmer register, distinct from the
 *  denser Tutor/Admin dashboards — without touching the shared primitive
 *  those dashboards still rely on. */
export function AcademicCard({ children, className, interactive = false, ...props }: AcademicCardProps) {
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
