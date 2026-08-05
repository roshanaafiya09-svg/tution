import { AlertTriangle } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/cn';

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  className,
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-lg border border-error/20 bg-error-bg px-6 py-10 text-center dark:border-error/25 dark:bg-error/10',
        className,
      )}
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-error dark:bg-neutral-900 dark:text-error-dark">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </div>
      <p className="font-medium text-neutral-800 dark:text-neutral-100">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-neutral-600 dark:text-neutral-400">{description}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-5">
          Try again
        </Button>
      )}
    </div>
  );
}

/** Inline, low-emphasis error line — for form-level submit errors under a button. */
export function InlineError({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-sm text-error dark:text-error-dark">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  );
}
