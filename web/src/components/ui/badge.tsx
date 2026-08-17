import { cn } from '@/lib/cn';

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-success-bg text-success dark:bg-success/15 dark:text-success-dark',
  due: 'bg-warning-bg text-warning dark:bg-warning/15 dark:text-warning-dark',
  partial: 'bg-warning-bg text-warning dark:bg-warning/15 dark:text-warning-dark',
  waived: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
  present: 'bg-success-bg text-success dark:bg-success/15 dark:text-success-dark',
  absent: 'bg-error-bg text-error dark:bg-error/15 dark:text-error-dark',
  late: 'bg-warning-bg text-warning dark:bg-warning/15 dark:text-warning-dark',
  scheduled: 'bg-info-bg text-info dark:bg-info/15 dark:text-info-dark',
  completed: 'bg-success-bg text-success dark:bg-success/15 dark:text-success-dark',
  cancelled: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
  active: 'bg-success-bg text-success dark:bg-success/15 dark:text-success-dark',
  archived: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
  left: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
  verified: 'bg-success-bg text-success dark:bg-success/15 dark:text-success-dark',
  approved: 'bg-success-bg text-success dark:bg-success/15 dark:text-success-dark',
  pending: 'bg-warning-bg text-warning dark:bg-warning/15 dark:text-warning-dark',
  pending_review: 'bg-warning-bg text-warning dark:bg-warning/15 dark:text-warning-dark',
  rejected: 'bg-error-bg text-error dark:bg-error/15 dark:text-error-dark',
  captured: 'bg-success-bg text-success dark:bg-success/15 dark:text-success-dark',
  created: 'bg-info-bg text-info dark:bg-info/15 dark:text-info-dark',
  failed: 'bg-error-bg text-error dark:bg-error/15 dark:text-error-dark',
  refunded: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
  trialing: 'bg-info-bg text-info dark:bg-info/15 dark:text-info-dark',
  past_due: 'bg-error-bg text-error dark:bg-error/15 dark:text-error-dark',
  confirmed: 'bg-success-bg text-success dark:bg-success/15 dark:text-success-dark',
  pending_payment: 'bg-warning-bg text-warning dark:bg-warning/15 dark:text-warning-dark',
  no_show: 'bg-error-bg text-error dark:bg-error/15 dark:text-error-dark',
  waiting: 'bg-warning-bg text-warning dark:bg-warning/15 dark:text-warning-dark',
  notified: 'bg-info-bg text-info dark:bg-info/15 dark:text-info-dark',
  converted: 'bg-success-bg text-success dark:bg-success/15 dark:text-success-dark',
  expired: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
  graded: 'bg-success-bg text-success dark:bg-success/15 dark:text-success-dark',
  processing: 'bg-info-bg text-info dark:bg-info/15 dark:text-info-dark',
  submitted: 'bg-info-bg text-info dark:bg-info/15 dark:text-info-dark',
  not_started: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
  due_soon: 'bg-warning-bg text-warning dark:bg-warning/15 dark:text-warning-dark',
  overdue: 'bg-error-bg text-error dark:bg-error/15 dark:text-error-dark',
  under_review: 'bg-info-bg text-info dark:bg-info/15 dark:text-info-dark',
  needs_manual_review: 'bg-warning-bg text-warning dark:bg-warning/15 dark:text-warning-dark',
};

const DOT_STYLES: Record<string, string> = {
  paid: 'bg-success',
  due: 'bg-warning',
  present: 'bg-success',
  absent: 'bg-error',
  active: 'bg-success',
  verified: 'bg-success',
  approved: 'bg-success',
  pending: 'bg-warning',
  rejected: 'bg-error',
  failed: 'bg-error',
  overdue: 'bg-error',
  due_soon: 'bg-warning',
  under_review: 'bg-info',
  needs_manual_review: 'bg-warning',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
        STATUS_STYLES[status] ?? 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
        className,
      )}
    >
      {DOT_STYLES[status] && <span className={cn('h-1.5 w-1.5 rounded-full', DOT_STYLES[status])} aria-hidden />}
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export function Badge({
  children,
  variant = 'neutral',
  className,
}: {
  children: React.ReactNode;
  variant?: 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'error' | 'info';
  className?: string;
}) {
  const variants = {
    neutral: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
    accent: 'bg-accent-100 text-accent-800 dark:bg-accent-500/15 dark:text-accent-300',
    success: 'bg-success-bg text-success dark:bg-success/15 dark:text-success-dark',
    warning: 'bg-warning-bg text-warning dark:bg-warning/15 dark:text-warning-dark',
    error: 'bg-error-bg text-error dark:bg-error/15 dark:text-error-dark',
    info: 'bg-info-bg text-info dark:bg-info/15 dark:text-info-dark',
  };
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', variants[variant], className)}>
      {children}
    </span>
  );
}
