import Link from 'next/link';
import { ArrowRight, CalendarCheck, ClipboardCheck, Award } from 'lucide-react';
import { ParentCard } from './parent-card';
import { StatusBadge } from '@/components/ui';

/** A real learning profile for one child — not a bare database row. Shows
 *  whatever the backend actually has (digest narrative, progress rates);
 *  omits a stat entirely rather than showing a fabricated number, and
 *  surfaces the DPDP consent step plainly when it's still pending. */
export function ChildOverviewCard({
  name,
  href,
  digestNarrative,
  attendanceRate,
  assignmentRate,
  quizRate,
  consentPending = false,
  onGrantConsent,
  consenting = false,
}: {
  name: string;
  href?: string;
  digestNarrative?: string | null;
  attendanceRate?: number | null;
  assignmentRate?: number | null;
  quizRate?: number | null;
  consentPending?: boolean;
  onGrantConsent?: () => void;
  consenting?: boolean;
}) {
  const stats = [
    { icon: CalendarCheck, label: 'Attendance', value: attendanceRate },
    { icon: ClipboardCheck, label: 'Assignments', value: assignmentRate },
    { icon: Award, label: 'Quizzes', value: quizRate },
  ].filter((s) => s.value !== undefined && s.value !== null);

  if (consentPending) {
    return (
      <ParentCard className="flex h-full flex-col justify-between gap-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">{name}</p>
            <StatusBadge status="pending" />
          </div>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            Grant consent to start seeing {name}&apos;s attendance, progress, and weekly digest.
          </p>
        </div>
        {onGrantConsent && (
          <button
            type="button"
            onClick={onGrantConsent}
            disabled={consenting}
            className="self-start text-sm font-medium text-brand-600 transition-colors hover:text-brand-700 disabled:opacity-50 dark:text-brand-300 dark:hover:text-brand-200"
          >
            {consenting ? 'Saving…' : 'Grant consent →'}
          </button>
        )}
      </ParentCard>
    );
  }

  return (
    <Link href={href ?? '/parent'} className="group block h-full">
      <ParentCard interactive className="flex h-full flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <p className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">{name}</p>
          <ArrowRight
            className="mt-1 h-4 w-4 shrink-0 text-neutral-300 transition-transform duration-fast group-hover:translate-x-0.5 dark:text-neutral-600"
            aria-hidden
          />
        </div>

        {stats.length > 0 && (
          <div className="flex items-center gap-4 border-t border-neutral-100 pt-4 dark:border-neutral-800/80">
            {stats.map((s) => (
              <div key={s.label} className="min-w-0">
                <p className="flex items-center gap-1 text-xs text-neutral-400 dark:text-neutral-500">
                  <s.icon className="h-3 w-3" aria-hidden />
                  {s.label}
                </p>
                <p className="mt-0.5 font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                  {s.value}%
                </p>
              </div>
            ))}
          </div>
        )}

        <p className="line-clamp-2 text-sm text-neutral-600 dark:text-neutral-400">
          {digestNarrative ?? 'No weekly digest yet.'}
        </p>
      </ParentCard>
    </Link>
  );
}
