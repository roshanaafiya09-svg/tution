import type { ReactNode } from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

/** A compact, elegant contextual empty state for sections inside the
 *  Teacher Dashboard — a single quiet line instead of a giant bordered
 *  rectangle. Mirrors Parent's `ParentEmptyState`. Use the shared
 *  `EmptyState` for a page's sole/primary content area instead. */
export function TeacherEmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/60 px-5 py-4 dark:border-neutral-800 dark:bg-neutral-900/40',
        className,
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-neutral-400 shadow-xs dark:bg-neutral-900 dark:text-neutral-500">
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{title}</p>
        {description && <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}
