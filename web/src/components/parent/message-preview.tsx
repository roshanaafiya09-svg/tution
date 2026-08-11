import Link from 'next/link';
import { cn } from '@/lib/cn';

/** One conversation row — used both on Home's Messages preview and (via
 *  the same shape) the full Messages list, so the two never drift apart
 *  visually. */
export function MessagePreview({
  href,
  studentName,
  batchTitle,
  lastMessageAt,
  unread = false,
}: {
  href: string;
  studentName: string;
  batchTitle: string;
  lastMessageAt: string;
  unread?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold uppercase',
            unread
              ? 'bg-brand-600 text-white dark:bg-brand-500 dark:text-neutral-950'
              : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
          )}
          aria-hidden
        >
          {studentName.slice(0, 2)}
        </span>
        <div className="min-w-0">
          <p
            className={cn(
              'truncate text-sm',
              unread ? 'font-semibold text-neutral-900 dark:text-neutral-50' : 'font-medium text-neutral-800 dark:text-neutral-100',
            )}
          >
            {studentName}
          </p>
          <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">{batchTitle}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          {new Date(lastMessageAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
        </p>
        {unread && <span className="h-2 w-2 rounded-full bg-brand-500" aria-hidden />}
      </div>
    </Link>
  );
}
