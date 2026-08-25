'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  RefreshCw,
  Users,
} from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import { safeHref } from '@/lib/safe-url';
import type {
  AvailabilityException,
  AvailabilityRule,
  Booking,
  Session,
  Subject,
} from '@/lib/types';
import { Button, buttonVariants, CardSkeleton, ErrorState, StatusBadge } from '@/components/ui';
import { TeacherPageHeader, AcademicCard, TeacherEmptyState } from '@/components/dashboard';
import { cn } from '@/lib/cn';

type View = 'day' | 'week' | 'month';

const VIEWS: { id: View; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface CalendarEvent {
  id: string;
  kind: 'class' | 'booking';
  title: string;
  meta: string;
  start: Date;
  durationMin: number;
  status: string;
  href: string;
  meetingUrl: string | null;
  /** Bookings the student moved keep their original slot server-side. */
  rescheduledFrom: string | null;
}

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

/** Monday-first, matching how a teaching week is planned. */
function startOfWeek(date: Date): Date {
  const copy = startOfDay(date);
  const weekday = (copy.getDay() + 6) % 7;
  return addDays(copy, -weekday);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

function timeLabel(date: Date): string {
  return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** The teacher's general availability for one calendar day: their weekly
 *  rules, with a same-day exception taking precedence. */
function availabilityForDay(
  date: Date,
  rules: AvailabilityRule[],
  exceptions: AvailabilityException[],
): { available: boolean; windows: string[]; exceptional: boolean } {
  const key = isoDate(date);
  const exception = exceptions.find((e) => e.date.slice(0, 10) === key);
  if (exception) {
    if (!exception.is_available) return { available: false, windows: [], exceptional: true };
    return {
      available: true,
      exceptional: true,
      windows:
        exception.start_time && exception.end_time
          ? [`${exception.start_time.slice(0, 5)}–${exception.end_time.slice(0, 5)}`]
          : ['All day'],
    };
  }

  const windows = rules
    .filter((rule) => {
      if (rule.weekday !== date.getDay()) return false;
      if (rule.effective_from.slice(0, 10) > key) return false;
      if (rule.effective_to && rule.effective_to.slice(0, 10) < key) return false;
      return true;
    })
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map((rule) => `${rule.start_time.slice(0, 5)}–${rule.end_time.slice(0, 5)}`);

  return { available: windows.length > 0, windows, exceptional: false };
}

function EventChip({ event, compact = false }: { event: CalendarEvent; compact?: boolean }) {
  const cancelled = event.status === 'cancelled';
  return (
    <Link
      href={event.href}
      title={`${timeLabel(event.start)} · ${event.title}`}
      className={cn(
        'block truncate rounded-md border-l-2 px-1.5 py-1 text-left text-[11px] font-medium transition-colors',
        compact ? 'leading-tight' : 'text-xs',
        cancelled
          ? 'border-neutral-300 bg-neutral-50 text-neutral-400 line-through dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-500'
          : event.kind === 'booking'
            ? 'border-accent-500 bg-accent-50 text-accent-800 hover:bg-accent-100 dark:bg-accent-500/10 dark:text-accent-200 dark:hover:bg-accent-500/20'
            : 'border-brand-500 bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-200 dark:hover:bg-brand-500/20',
      )}
    >
      {timeLabel(event.start)} {event.title}
    </Link>
  );
}

function EventRow({ event }: { event: CalendarEvent }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
      <span
        className={cn(
          'w-16 shrink-0 text-sm font-medium tabular-nums',
          event.status === 'cancelled'
            ? 'text-neutral-400 line-through dark:text-neutral-500'
            : 'text-neutral-900 dark:text-neutral-50',
        )}
      >
        {timeLabel(event.start)}
      </span>
      <span
        className={cn(
          'h-8 w-0.5 shrink-0 rounded-full',
          event.kind === 'booking' ? 'bg-accent-500' : 'bg-brand-500',
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <Link
            href={event.href}
            className="truncate text-sm font-medium text-neutral-900 transition-colors hover:text-brand-700 dark:text-neutral-50 dark:hover:text-brand-300"
          >
            {event.title}
          </Link>
          {event.kind === 'booking' && (
            <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[11px] font-medium text-accent-800 dark:bg-accent-500/15 dark:text-accent-200">
              1:1 booking
            </span>
          )}
          {event.rescheduledFrom && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              <RefreshCw className="h-3 w-3" aria-hidden />
              Rescheduled
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
          {event.meta} · {event.durationMin} min
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <StatusBadge status={event.status} />
        {safeHref(event.meetingUrl) && event.status !== 'cancelled' && (
          <a
            href={safeHref(event.meetingUrl)}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: 'secondary', size: 'sm' })}
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Join
          </a>
        )}
      </span>
    </li>
  );
}

export default function CalendarPage() {
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [loadError, setLoadError] = useState(false);

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (view === 'day') return { rangeStart: startOfDay(anchor), rangeEnd: addDays(startOfDay(anchor), 1) };
    if (view === 'week') return { rangeStart: startOfWeek(anchor), rangeEnd: addDays(startOfWeek(anchor), 7) };
    const gridStart = startOfWeek(startOfMonth(anchor));
    return { rangeStart: gridStart, rangeEnd: addDays(gridStart, 42) };
  }, [view, anchor]);

  const load = useCallback(() => {
    setLoadError(false);
    setSessions(null);
    Promise.all([
      api.get<Session[]>(`/sessions/me?from=${rangeStart.toISOString()}&to=${rangeEnd.toISOString()}`),
      api.get<Booking[]>('/marketplace/bookings/tutor').catch(() => [] as Booking[]),
      api.get<Subject[]>('/catalog/subjects').catch(() => [] as Subject[]),
      api.get<AvailabilityRule[]>('/availability/me').catch(() => [] as AvailabilityRule[]),
      api.get<AvailabilityException[]>('/availability/exceptions/me').catch(() => [] as AvailabilityException[]),
    ])
      .then(([sessionRows, bookingRows, subjectRows, ruleRows, exceptionRows]) => {
        setSessions(sessionRows);
        setBookings(bookingRows);
        setSubjects(subjectRows);
        setRules(ruleRows);
        setExceptions(exceptionRows);
      })
      .catch(() => setLoadError(true));
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    load();
  }, [load]);

  const events = useMemo<CalendarEvent[]>(() => {
    const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name_i18n.en ?? 'Session';
    const classEvents: CalendarEvent[] = (sessions ?? []).map((session) => ({
      id: `session-${session.id}`,
      kind: 'class',
      title: session.batch_title,
      meta: 'Batch class',
      start: new Date(session.scheduled_start_utc),
      durationMin: session.duration_min,
      status: session.status,
      href: `/dashboard/sessions/${session.id}`,
      meetingUrl: session.meeting_url,
      rescheduledFrom: null,
    }));

    const bookingEvents: CalendarEvent[] = bookings
      .filter((booking) => {
        const start = new Date(booking.scheduled_start_utc);
        return start >= rangeStart && start < rangeEnd;
      })
      .map((booking) => ({
        id: `booking-${booking.id}`,
        kind: 'booking',
        title: subjectName(booking.subject_id),
        meta: `${formatMinor(booking.amount_minor, booking.currency)} · marketplace booking`,
        start: new Date(booking.scheduled_start_utc),
        durationMin: booking.duration_min,
        status: booking.status,
        href: '/dashboard/marketplace',
        meetingUrl: booking.meeting_url,
        rescheduledFrom: booking.original_scheduled_start_utc,
      }));

    return [...classEvents, ...bookingEvents].sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [sessions, bookings, subjects, rangeStart, rangeEnd]);

  const eventsOn = useCallback(
    (date: Date) => events.filter((event) => sameDay(event.start, date)),
    [events],
  );

  function shift(direction: 1 | -1) {
    if (view === 'day') setAnchor((current) => addDays(current, direction));
    else if (view === 'week') setAnchor((current) => addDays(current, direction * 7));
    else setAnchor((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  }

  function goToday() {
    const today = startOfDay(new Date());
    setAnchor(today);
    setSelectedDay(today);
  }

  const rangeLabel =
    view === 'month'
      ? anchor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
      : view === 'week'
        ? `${startOfWeek(anchor).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${addDays(
            startOfWeek(anchor),
            6,
          ).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
        : anchor.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i)),
    [anchor],
  );
  const monthDays = useMemo(
    () => Array.from({ length: 42 }, (_, i) => addDays(startOfWeek(startOfMonth(anchor)), i)),
    [anchor],
  );

  const dayEvents = eventsOn(view === 'month' ? selectedDay : anchor);
  const dayAvailability = availabilityForDay(view === 'month' ? selectedDay : anchor, rules, exceptions);
  const weekAvailableDays = weekDays.filter((day) => availabilityForDay(day, rules, exceptions).available).length;
  const today = startOfDay(new Date());

  return (
    <div className="space-y-5">
      <TeacherPageHeader
        eyebrow="Your schedule"
        title="Calendar"
        description="Batch classes, 1:1 marketplace bookings, and the days you're generally free to teach."
        action={
          <Link href="/dashboard/availability" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            <Clock className="h-3.5 w-3.5" aria-hidden />
            Edit availability
          </Link>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Button variant="secondary" size="icon" onClick={() => shift(-1)} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          <Button variant="secondary" size="icon" onClick={() => shift(1)} aria-label="Next">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
          <Button variant="secondary" size="sm" onClick={goToday}>
            Today
          </Button>
          <p className="ml-2 font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            {rangeLabel}
          </p>
        </div>

        <div className="flex rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-800">
          {VIEWS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setView(option.id)}
              aria-pressed={view === option.id}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:shadow-focus-ring',
                view === option.id
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'
                  : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loadError ? (
        <ErrorState description="Could not load your calendar. Check your connection and try again." onRetry={load} />
      ) : sessions === null ? (
        <CardSkeleton className="h-96 rounded-2xl" />
      ) : (
        <>
          {view === 'month' && (
            <AcademicCard className="p-0">
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
                  const inMonth = day.getMonth() === anchor.getMonth();
                  const dayItems = eventsOn(day);
                  const availability = availabilityForDay(day, rules, exceptions);
                  const isToday = sameDay(day, today);
                  const isSelected = sameDay(day, selectedDay);
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => setSelectedDay(day)}
                      className={cn(
                        'min-h-[5.5rem] border-b border-r border-neutral-100 p-1.5 text-left align-top transition-colors last:border-r-0 focus-visible:outline-none focus-visible:shadow-focus-ring dark:border-neutral-800',
                        !inMonth && 'bg-neutral-50/60 dark:bg-neutral-900/30',
                        availability.available && inMonth && 'bg-brand-50/25 dark:bg-brand-500/[0.04]',
                        isSelected && 'ring-1 ring-inset ring-brand-400 dark:ring-brand-500/60',
                      )}
                    >
                      <span className="flex items-center justify-between">
                        <span
                          className={cn(
                            'flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium tabular-nums',
                            isToday
                              ? 'bg-brand-600 text-white dark:bg-brand-500 dark:text-neutral-950'
                              : inMonth
                                ? 'text-neutral-700 dark:text-neutral-200'
                                : 'text-neutral-300 dark:text-neutral-600',
                          )}
                        >
                          {day.getDate()}
                        </span>
                        {!availability.available && inMonth && (
                          <span
                            className="h-1 w-1 rounded-full bg-neutral-300 dark:bg-neutral-700"
                            title="Not generally available"
                            aria-hidden
                          />
                        )}
                      </span>
                      <span className="mt-1 flex flex-col gap-0.5">
                        {dayItems.slice(0, 2).map((event) => (
                          <EventChip key={event.id} event={event} compact />
                        ))}
                        {dayItems.length > 2 && (
                          <span className="px-1 text-[11px] text-neutral-400 dark:text-neutral-500">
                            +{dayItems.length - 2} more
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </AcademicCard>
          )}

          {view === 'week' && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7 lg:gap-2">
              {weekDays.map((day) => {
                const dayItems = eventsOn(day);
                const availability = availabilityForDay(day, rules, exceptions);
                const isToday = sameDay(day, today);
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'flex min-h-[9rem] flex-col rounded-xl border p-2.5 transition-colors',
                      isToday
                        ? 'border-brand-300 bg-brand-50/40 dark:border-brand-500/40 dark:bg-brand-500/[0.06]'
                        : 'border-neutral-200/70 bg-white dark:border-neutral-800/80 dark:bg-surface',
                    )}
                  >
                    <p className="flex items-baseline justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
                        {day.toLocaleDateString('en-IN', { weekday: 'short' })}
                      </span>
                      <span
                        className={cn(
                          'font-display text-lg font-semibold tabular-nums',
                          isToday ? 'text-brand-700 dark:text-brand-200' : 'text-neutral-900 dark:text-neutral-50',
                        )}
                      >
                        {day.getDate()}
                      </span>
                    </p>
                    <p className="mt-1 truncate text-[11px] text-neutral-400 dark:text-neutral-500">
                      {availability.available ? availability.windows.join(', ') : 'Not available'}
                    </p>
                    <div className="mt-2 flex flex-col gap-1">
                      {dayItems.length === 0 ? (
                        <span className="text-[11px] text-neutral-300 dark:text-neutral-600">No classes</span>
                      ) : (
                        dayItems.map((event) => <EventChip key={event.id} event={event} compact />)
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <AcademicCard className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-4 py-3 sm:px-5 dark:border-neutral-800">
              <div>
                <p className="font-display text-base font-semibold text-neutral-900 dark:text-neutral-50">
                  {view === 'month'
                    ? selectedDay.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
                    : view === 'week'
                      ? 'This week'
                      : 'Schedule'}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  {view === 'week'
                    ? weekAvailableDays === 0
                      ? 'No general availability set this week'
                      : `Generally available on ${weekAvailableDays} of 7 days`
                    : dayAvailability.available
                      ? `Generally available ${dayAvailability.windows.join(', ')}${
                          dayAvailability.exceptional ? ' (one-off exception)' : ''
                        }`
                      : `No general availability set for this day${
                          dayAvailability.exceptional ? ' (one-off exception)' : ''
                        }`}
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-neutral-400 dark:text-neutral-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-brand-500" aria-hidden />
                  Batch class
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-accent-500" aria-hidden />
                  1:1 booking
                </span>
              </div>
            </div>

            {view === 'week' ? (
              events.length === 0 ? (
                <div className="p-4 sm:p-5">
                  <TeacherEmptyState
                    icon={CalendarDays}
                    title="Nothing scheduled this week"
                    description="Schedule a class from a batch, or open availability so students can book you."
                    action={
                      <Link href="/dashboard/batches" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                        Schedule a class
                      </Link>
                    }
                  />
                </div>
              ) : (
                <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {events.map((event) => (
                    <EventRow key={event.id} event={event} />
                  ))}
                </ul>
              )
            ) : dayEvents.length === 0 ? (
              <div className="p-4 sm:p-5">
                <TeacherEmptyState
                  icon={CalendarDays}
                  title="Nothing scheduled"
                  description={
                    dayAvailability.available
                      ? "You're free to teach this day — no classes or bookings yet."
                      : 'No classes on this day, and no general availability set either.'
                  }
                  action={
                    <Link href="/dashboard/batches" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                      Schedule a class
                    </Link>
                  }
                />
              </div>
            ) : (
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {dayEvents.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </ul>
            )}
          </AcademicCard>

          <p className="flex items-center gap-2 text-xs text-neutral-400 dark:text-neutral-500">
            <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Availability shading shows when you&apos;re generally willing to teach. Actual classes and bookings are
            the items above.
          </p>
        </>
      )}
    </div>
  );
}
