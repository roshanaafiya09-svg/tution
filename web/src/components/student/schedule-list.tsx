import { PartyPopper, Video } from 'lucide-react';
import type { Batch, Session, Subject, ViewerHoliday } from '@/lib/types';
import { dayKeyIn, holidaySource, timeIn } from '@/lib/calendar';
import { StatusBadge, buttonVariants } from '@/components/ui';
import { AcademicCard, TimelineNode, TimelineDot } from '@/components/student';
import { cn } from '@/lib/cn';
import { safeHref } from '@/lib/safe-url';
import { cancellationReasonLabel } from '@/lib/session-labels';

// A class is shown in the timezone it was scheduled in — the same rule the
// teacher, academy and parent calendars use (lib/calendar.ts).
function formatTime(session: Session): string {
  return timeIn(session.scheduled_start_utc, session.timezone);
}

function dayKey(session: Session): string {
  return dayKeyIn(session.scheduled_start_utc, session.timezone);
}

function dayLabel(session: Session): string {
  const start = new Date(session.scheduled_start_utc);
  // "Today" is today in the class's own zone, so it agrees with dayKey above.
  if (dayKey(session) === new Date().toLocaleDateString('en-CA', { timeZone: session.timezone })) {
    return 'Today';
  }
  return start.toLocaleDateString('en-IN', {
    timeZone: session.timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** Label for a day that has a holiday but no class (no session zone to read). */
function holidayDayLabel(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('en-IN', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** Day-grouped session timeline — shared by the global Schedule page (all
 *  batches) and each batch workspace's Schedule tab (one batch's sessions
 *  already pre-filtered by the caller). Renders nothing about loading,
 *  errors, or the empty state — callers own those, same as every other
 *  extracted `*List` component. */
export function ScheduleList({
  sessions,
  batches,
  subjects,
  holidayDays = [],
}: {
  sessions: Session[];
  batches: Batch[];
  subjects: Subject[];
  /** Academy / government holidays that fall on days in the shown range, one
   *  entry per calendar day (see holidayDaysInRange). Optional — the per-batch
   *  Schedule tab omits it. */
  holidayDays?: { key: string; holidays: ViewerHoliday[] }[];
}) {
  function subjectFor(session: Session): string | undefined {
    const batch = batches.find((b) => b.id === session.batch_id);
    return batch ? subjects.find((s) => s.id === batch.subject_id)?.name_i18n.en : undefined;
  }

  const now = new Date();
  const nextSession = sessions.find((s) => s.status === 'scheduled' && new Date(s.scheduled_start_utc) >= now);

  const groups: { key: string; label: string; sessions: Session[]; holidays: ViewerHoliday[] }[] = [];
  for (const session of sessions) {
    const key = dayKey(session);
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, label: dayLabel(session), sessions: [], holidays: [] };
      groups.push(group);
    }
    group.sessions.push(session);
  }
  for (const day of holidayDays) {
    let group = groups.find((g) => g.key === day.key);
    if (!group) {
      group = { key: day.key, label: holidayDayLabel(day.key), sessions: [], holidays: [] };
      groups.push(group);
    }
    group.holidays = day.holidays;
  }
  groups.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <div key={group.key}>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-500 dark:text-brand-300">
            {group.label}
          </p>
          {group.holidays.map((holiday) => (
            <div
              key={holiday.id}
              className="mb-3 flex items-center gap-2 rounded-xl border border-info/30 bg-info-bg px-4 py-3 text-sm text-info dark:bg-info/15 dark:text-info-dark"
            >
              <PartyPopper className="h-4 w-4 shrink-0" aria-hidden />
              <span className="font-medium">{holiday.name}</span>
              <span className="text-xs opacity-80">{holidaySource(holiday)} — no classes</span>
            </div>
          ))}
          <div>
            {group.sessions.map((session, i) => {
              const subject = subjectFor(session);
              const isNext = session.id === nextSession?.id;
              // The backend's status is the source of truth: a cancelled class is
              // never joinable (the join endpoint rejects it too).
              const cancelled = session.status === 'cancelled';
              return (
                <TimelineNode key={session.id} isLast={i === group.sessions.length - 1} marker={<TimelineDot active={isNext} />}>
                  <AcademicCard
                    className={cn(
                      'flex flex-wrap items-center justify-between gap-3',
                      isNext && 'border-brand-300 bg-brand-50/40 dark:border-brand-500/30 dark:bg-brand-500/5',
                      cancelled && 'opacity-70',
                    )}
                  >
                    <div>
                      <p className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                        {subject ?? session.batch_title}
                      </p>
                      <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                        {subject ? `${session.batch_title} · ` : ''}
                        {formatTime(session)} · {session.duration_min} min
                      </p>
                      {cancelled && (
                        <p className="mt-1 text-sm font-medium text-error dark:text-error-dark">
                          {cancellationReasonLabel({ status: session.status, cancellationReason: session.cancellation_reason }) ??
                            'Cancelled'}
                          {' — '}this class won&apos;t take place.
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={session.status} />
                      {!cancelled && safeHref(session.meeting_url) && (
                        <a
                          href={safeHref(session.meeting_url)}
                          target="_blank"
                          rel="noreferrer"
                          className={buttonVariants({ variant: 'accent', size: 'sm' })}
                        >
                          <Video className="h-3.5 w-3.5" aria-hidden />
                          Join class
                        </a>
                      )}
                    </div>
                  </AcademicCard>
                </TimelineNode>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
