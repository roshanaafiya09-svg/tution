'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight, PartyPopper, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import type { ParentLink, Session, ViewerHoliday } from '@/lib/types';
import { cancellationReasonLabel } from '@/lib/session-labels';
import { dayKeyIn, holidaysOnDay, holidaySource, localDateKey, timeIn } from '@/lib/calendar';
import { Button, buttonVariants, CardSkeleton, EmptyState, ErrorState, PageHeader, StatusBadge } from '@/components/ui';
import { ChildSwitcher, ParentCard, ParentEmptyState } from '@/components/parent';
import { cn } from '@/lib/cn';

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}
/** Monday-first, same as the Teacher calendar. */
function startOfWeek(date: Date): Date {
  const copy = startOfDay(date);
  return addDays(copy, -((copy.getDay() + 6) % 7));
}
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function sameDay(a: Date, b: Date): boolean {
  return localDateKey(a) === localDateKey(b);
}

/** The parent's read-only calendar for ONE linked child: that child's classes
 *  (with cancellations, reschedules — a moved class simply sits at its new
 *  time — and substitutes) plus the Academy / government holidays that touch
 *  them. Every request is child-scoped server-side: the sessions route
 *  requires an active consented link, and /holidays/me only returns holidays
 *  of the academies the parent's own children are in. */
export default function ParentCalendarPage() {
  const [links, setLinks] = useState<ParentLink[] | null>(null);
  const [childId, setChildId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [holidays, setHolidays] = useState<ViewerHoliday[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null);

  const monthDays = useMemo(
    () => Array.from({ length: 42 }, (_, i) => addDays(startOfWeek(startOfMonth(anchor)), i)),
    [anchor],
  );
  // Memoised: a fresh Date every render would change loadSchedule's identity
  // and re-run the load effect forever.
  const { rangeStart, rangeEnd } = useMemo(
    () => ({ rangeStart: monthDays[0], rangeEnd: addDays(monthDays[41], 1) }),
    [monthDays],
  );

  const children = useMemo(() => (links ?? []).filter((l) => l.status === 'active'), [links]);

  const loadLinks = useCallback(() => {
    setLoadError(null);
    api
      .get<ParentLink[]>('/parent-links/me')
      .then((rows) => {
        setLinks(rows);
        const active = rows.filter((l) => l.status === 'active');
        setChildId((current) => current ?? active[0]?.student_id ?? null);
      })
      .catch((err: unknown) => setLoadError(err ?? true));
  }, []);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  const loadSchedule = useCallback(() => {
    if (!childId) return;
    setLoadError(null);
    setSessions(null);
    // A day either side: a class is bucketed by ITS timezone's day.
    const from = addDays(rangeStart, -1).toISOString();
    const to = addDays(rangeEnd, 1).toISOString();
    Promise.all([
      api.get<Session[]>(`/sessions/student/${childId}?from=${from}&to=${to}`),
      api.get<ViewerHoliday[]>(`/holidays/me?from=${localDateKey(rangeStart)}&to=${localDateKey(rangeEnd)}`),
    ])
      .then(([sessionRows, holidayRows]) => {
        setSessions(sessionRows);
        setHolidays(holidayRows);
      })
      .catch((err: unknown) => setLoadError(err ?? true));
  }, [childId, rangeStart, rangeEnd]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  // Only the holidays that touch the selected child (a parent with two
  // children in different academies must not see one child's holiday on
  // the other's calendar).
  const childHolidays = useMemo(
    () => holidays.filter((h) => childId !== null && h.student_ids.includes(childId)),
    [holidays, childId],
  );

  const sessionsByDay = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const session of sessions ?? []) {
      const key = dayKeyIn(session.scheduled_start_utc, session.timezone);
      map.set(key, [...(map.get(key) ?? []), session]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.scheduled_start_utc.localeCompare(b.scheduled_start_utc));
    }
    return map;
  }, [sessions]);

  const today = startOfDay(new Date());
  const selectedKey = localDateKey(selectedDay);
  const daySessions = sessionsByDay.get(selectedKey) ?? [];
  const dayHolidays = holidaysOnDay(childHolidays, selectedKey);

  function shift(direction: 1 | -1) {
    setAnchor((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  }
  function goToday() {
    setAnchor(startOfMonth(new Date()));
    setSelectedDay(startOfDay(new Date()));
  }

  if (links === null && !loadError) {
    return <CardSkeleton className="h-96 rounded-2xl" />;
  }
  if (loadError && links === null) {
    return <ErrorState error={loadError} what="your calendar" onRetry={loadLinks} />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Schedule"
        title="Calendar"
        description="Your child's classes, changes and holidays."
      />

      {children.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No linked child yet"
          description="Link your child's account to see their class schedule here."
          action={
            <Link href="/parent/link" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
              Link a child
            </Link>
          }
        />
      ) : (
        <>
          <ChildSwitcher
            options={children.map((c) => ({ studentId: c.student_id, name: c.student_display_name ?? 'Your child' }))}
            activeId={childId ?? ''}
            onSelect={(id) => {
              setChildId(id);
              setSessions(null);
            }}
          />

          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="secondary" size="icon" onClick={() => shift(-1)} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <Button variant="secondary" size="icon" onClick={() => shift(1)} aria-label="Next month">
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
            <Button variant="secondary" size="sm" onClick={goToday}>
              Today
            </Button>
            <p className="ml-2 font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              {anchor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            </p>
          </div>

          {loadError ? (
            <ErrorState error={loadError} what="the schedule" onRetry={loadSchedule} />
          ) : sessions === null ? (
            <CardSkeleton className="h-96 rounded-2xl" />
          ) : (
            <>
              <ParentCard className="p-0">
                <div className="grid grid-cols-7 border-b border-neutral-100 dark:border-neutral-800">
                  {WEEKDAY_SHORT.map((day) => (
                    <div
                      key={day}
                      className="px-1.5 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500"
                    >
                      <span className="hidden sm:inline">{day}</span>
                      <span className="sm:hidden">{day[0]}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {monthDays.map((day) => {
                    const key = localDateKey(day);
                    const inMonth = day.getMonth() === anchor.getMonth();
                    const items = sessionsByDay.get(key) ?? [];
                    const hols = holidaysOnDay(childHolidays, key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedDay(day)}
                        aria-label={day.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                        className={cn(
                          'min-h-[5.5rem] border-b border-r border-neutral-100 p-1.5 text-left align-top transition-colors last:border-r-0 focus-visible:outline-none focus-visible:shadow-focus-ring dark:border-neutral-800',
                          !inMonth && 'bg-neutral-50/60 dark:bg-neutral-900/30',
                          key === selectedKey && 'ring-1 ring-inset ring-brand-400 dark:ring-brand-500/60',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium tabular-nums',
                            sameDay(day, today)
                              ? 'bg-brand-600 text-white dark:bg-brand-500 dark:text-neutral-950'
                              : inMonth
                                ? 'text-neutral-700 dark:text-neutral-200'
                                : 'text-neutral-300 dark:text-neutral-600',
                          )}
                        >
                          {day.getDate()}
                        </span>
                        <span className="mt-1 flex flex-col gap-0.5">
                          {hols.slice(0, 1).map((holiday) => (
                            <span
                              key={holiday.id}
                              className="flex items-center gap-1 truncate rounded-md border-l-2 border-info bg-info-bg px-1.5 py-0.5 text-[11px] font-medium text-info dark:bg-info/15 dark:text-info-dark"
                            >
                              <PartyPopper className="h-3 w-3 shrink-0" aria-hidden />
                              <span className="truncate">{holiday.name}</span>
                            </span>
                          ))}
                          {items.slice(0, 2).map((session) => (
                            <span
                              key={session.id}
                              className={cn(
                                'block truncate rounded-md border-l-2 px-1.5 py-0.5 text-[11px] font-medium leading-tight',
                                session.status === 'cancelled'
                                  ? 'border-neutral-300 bg-neutral-50 text-neutral-400 line-through dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-500'
                                  : 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200',
                              )}
                            >
                              {timeIn(session.scheduled_start_utc, session.timezone)} {session.batch_title}
                            </span>
                          ))}
                          {items.length > 2 && (
                            <span className="px-1 text-[11px] text-neutral-400 dark:text-neutral-500">
                              +{items.length - 2} more
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </ParentCard>

              <ParentCard className="p-0">
                <div className="border-b border-neutral-100 px-4 py-3 sm:px-5 dark:border-neutral-800">
                  <p className="font-display text-base font-semibold text-neutral-900 dark:text-neutral-50">
                    {selectedDay.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                </div>

                {dayHolidays.length > 0 && (
                  <ul className="space-y-1.5 border-b border-neutral-100 px-4 py-3 sm:px-5 dark:border-neutral-800">
                    {dayHolidays.map((holiday) => (
                      <li key={holiday.id} className="flex items-center gap-2 text-sm text-info dark:text-info-dark">
                        <PartyPopper className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="font-medium">{holiday.name}</span>
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">
                          {holidaySource(holiday)} — no classes
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {daySessions.length === 0 ? (
                  <div className="p-4 sm:p-5">
                    <ParentEmptyState
                      icon={CalendarDays}
                      title="No classes this day"
                      description="Nothing is scheduled for your child on this date."
                    />
                  </div>
                ) : (
                  <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {daySessions.map((session) => {
                      const cancelled = session.status === 'cancelled';
                      return (
                        <li key={session.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                          <span
                            className={cn(
                              'w-20 shrink-0 text-sm font-medium tabular-nums',
                              cancelled
                                ? 'text-neutral-400 line-through dark:text-neutral-500'
                                : 'text-neutral-900 dark:text-neutral-50',
                            )}
                          >
                            {timeIn(session.scheduled_start_utc, session.timezone)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                              {session.batch_title}
                            </span>
                            <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                              {session.tutor_display_name ?? 'Teacher'} · {session.duration_min} min
                              {session.substitute_display_name && !cancelled
                                ? ` · Covered by ${session.substitute_display_name}`
                                : ''}
                            </span>
                            {cancelled && (
                              <span className="mt-0.5 block text-xs font-medium text-error dark:text-error-dark">
                                {cancellationReasonLabel({
                                  status: session.status,
                                  cancellationReason: session.cancellation_reason,
                                }) ?? 'Cancelled'}{' '}
                                — this class won&apos;t take place.
                              </span>
                            )}
                          </span>
                          <StatusBadge status={session.status} />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ParentCard>
            </>
          )}
        </>
      )}
    </div>
  );
}
