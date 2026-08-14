import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface AcademyCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Lift + shadow-md on hover, for cards that are themselves a link/button. */
  interactive?: boolean;
}

/** The Academy Dashboard's base surface — same shape as the Student
 *  Dashboard's AcademicCard (see that file's doc comment for why this is
 *  its own copy rather than a shared import: each dashboard's design
 *  layer is kept deliberately separate so no dashboard's redesign
 *  touches another's). */
export function AcademyCard({ children, className, interactive = false, ...props }: AcademyCardProps) {
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
