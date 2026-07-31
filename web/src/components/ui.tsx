import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-neutral-200 bg-white p-6 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-semibold text-neutral-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  className?: string;
}) {
  const variants = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700',
    secondary: 'border border-neutral-300 text-neutral-700 hover:bg-neutral-100',
    danger: 'border border-error/30 text-error hover:bg-error/5',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      {children}
      {hint && <span className="text-xs text-neutral-400">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30';

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 bg-white/50 px-6 py-12 text-center">
      <p className="font-medium text-neutral-700">{title}</p>
      <p className="mt-1 text-sm text-neutral-500">{description}</p>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-success-bg text-success',
  due: 'bg-warning-bg text-warning',
  partial: 'bg-warning-bg text-warning',
  waived: 'bg-neutral-100 text-neutral-500',
  present: 'bg-success-bg text-success',
  absent: 'bg-error-bg text-error',
  late: 'bg-warning-bg text-warning',
  scheduled: 'bg-info-bg text-info',
  completed: 'bg-success-bg text-success',
  cancelled: 'bg-neutral-100 text-neutral-500',
  active: 'bg-success-bg text-success',
  archived: 'bg-neutral-100 text-neutral-500',
  verified: 'bg-success-bg text-success',
  pending: 'bg-warning-bg text-warning',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
        STATUS_STYLES[status] ?? 'bg-neutral-100 text-neutral-600'
      }`}
    >
      {status}
    </span>
  );
}
