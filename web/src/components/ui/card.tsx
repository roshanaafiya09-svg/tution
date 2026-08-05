import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Adds hover elevation + pointer affordance for clickable cards (list rows, tutor cards). */
  interactive?: boolean;
}

export function Card({ children, className = '', interactive = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-neutral-200 bg-white p-6 shadow-xs transition-shadow duration-base dark:border-neutral-800 dark:bg-surface',
        interactive && 'cursor-pointer hover:shadow-md hover:border-neutral-300 dark:hover:border-neutral-700',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={cn('mb-4 flex items-start justify-between gap-4', className)}>{children}</div>;
}

export function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn('text-base font-semibold text-neutral-900 dark:text-neutral-50', className)}>
      {children}
    </h3>
  );
}

export function CardDescription({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={cn('mt-1 text-sm text-neutral-500 dark:text-neutral-400', className)}>{children}</p>;
}

export function CardFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'mt-4 flex items-center justify-end gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-800',
        className,
      )}
    >
      {children}
    </div>
  );
}
