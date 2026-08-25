import Link from 'next/link';
import { Video, Users } from 'lucide-react';
import { AcademicCard } from './academic-card';
import { buttonVariants } from '@/components/ui';
import { cn } from '@/lib/cn';
import { safeHref } from '@/lib/safe-url';

/** A single class/session — the strongest visual element on Today and
 *  the Sessions timeline. Shows only fields that actually exist; the
 *  Join action only appears when a real meeting URL is on the session. */
export function SessionCard({
  batchTitle,
  subject,
  timeLabel,
  durationMin,
  studentCount,
  meetingUrl,
  href,
  emphasized = false,
}: {
  batchTitle: string;
  subject?: string;
  timeLabel: string;
  durationMin: number;
  studentCount?: number;
  meetingUrl?: string | null;
  href?: string;
  emphasized?: boolean;
}) {
  return (
    <AcademicCard
      className={cn(
        'flex flex-wrap items-center justify-between gap-4',
        emphasized && 'border-brand-200 bg-gradient-to-br from-brand-50/60 via-white to-white dark:border-brand-500/30 dark:from-brand-500/10 dark:via-transparent dark:to-transparent',
      )}
    >
      <div className="min-w-0">
        <p className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">{batchTitle}</p>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          {subject ? `${subject} · ` : ''}
          {timeLabel} · {durationMin} min
        </p>
        {studentCount !== undefined && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
            <Users className="h-3.5 w-3.5" aria-hidden />
            {studentCount} {studentCount === 1 ? 'student' : 'students'}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {safeHref(meetingUrl) && (
          <a
            href={safeHref(meetingUrl)}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: 'accent', size: 'sm' })}
          >
            <Video className="h-3.5 w-3.5" aria-hidden />
            Join class
          </a>
        )}
        {href && (
          <Link href={href} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            View
          </Link>
        )}
      </div>
    </AcademicCard>
  );
}
