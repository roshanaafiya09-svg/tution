import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface AcademicCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Lift + shadow-md on hover, for cards that are themselves a link/button. */
  interactive?: boolean;
}

/** The Teacher Dashboard's base surface — softer and more elevated than
 *  the shared `Card` (larger radius, shadow-sm resting), mirroring the
 *  Student/Parent `AcademicCard`/`ParentCard` so all three dashboards
 *  read as one product, without touching the shared primitive Admin
 *  still relies on. */
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
