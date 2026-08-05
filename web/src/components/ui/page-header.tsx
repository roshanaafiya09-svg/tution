import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/cn';

export function PageHeader({
  title,
  description,
  action,
  eyebrow,
  back,
  className = '',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  /** Small uppercase label above the title, e.g. a section/batch name for context. */
  eyebrow?: string;
  /** Optional back link shown above the title. */
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div className={cn('mb-8 flex flex-wrap items-start justify-between gap-4', className)}>
      <div>
        {back && (
          <Link
            href={back.href}
            className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {back.label}
          </Link>
        )}
        {eyebrow && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-brand-600 dark:text-brand-300">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
