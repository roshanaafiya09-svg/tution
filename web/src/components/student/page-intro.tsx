import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/cn';

/** The consistent page-level title treatment for every Student Dashboard
 *  page that isn't Overview (which leads with `HeroPanel` instead). Larger
 *  and more present than `SectionHeader` (which is for in-page
 *  subsections), so the hierarchy between "this is the page" and "this is
 *  a section of the page" stays legible everywhere. */
export function PageIntro({
  eyebrow,
  title,
  description,
  action,
  back,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
      <div>
        {back && (
          <Link
            href={back.href}
            className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {back.label}
          </Link>
        )}
        {eyebrow && (
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-brand-500 dark:text-brand-300">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-3xl font-semibold text-neutral-900 dark:text-neutral-50 sm:text-[2.25rem]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-xl text-sm text-neutral-500 dark:text-neutral-400 sm:text-base">{description}</p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
