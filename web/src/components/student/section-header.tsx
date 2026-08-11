import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Section label for the Student Dashboard — a small brand-tinted eyebrow
 *  plus a Fraunces title, replacing plain `<h2>`s so every page shares the
 *  same editorial rhythm. */
export function SectionHeader({
  eyebrow,
  title,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  action?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex items-end justify-between gap-4', className)}>
      <div>
        {eyebrow && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-500 dark:text-brand-300">
            {eyebrow}
          </p>
        )}
        <h2 className="font-display text-xl font-semibold text-neutral-900 dark:text-neutral-50">{title}</h2>
      </div>
      {action && (
        <Link
          href={action.href}
          className="flex shrink-0 items-center gap-1 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
        >
          {action.label}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}
