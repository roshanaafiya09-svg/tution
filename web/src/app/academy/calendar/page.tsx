'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarOff, CalendarRange, ChevronLeft, ChevronRight, GraduationCap, PartyPopper } from 'lucide-react';
import { api } from '@/lib/api';
import type { AcademyActiveTeacher, AcademyManagedBatch, AcademyTodaySession, EffectiveHolidays } from '@/lib/types';
import { cancellationReasonLabel, sessionTime } from '@/lib/session-labels';
import { CardSkeleton, ErrorState, Select, StatusBadge } from '@/components/ui';
import { AcademyCard, AcademyPageIntro, AcademySetupBanner } from '@/components/academy';
import { useAcademyDashboard } from '@/components/academy-shell';
import { cn } from '@/lib/cn';

type ViewMode = 'month' | 'week' | 'day' | 'list';
type ItemKind = 'class' | 'holiday' | 'cancellation';

interface CalendarItem {
  id: string;
  date: Date;
  kind: ItemKind;
  title: string;
  subtitle: string | null;
  href: string | null;
  tutorId: string | null;
  batchId: string | null;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}
function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(d.getDate() + diff);
  return monday;
}
function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

export default function AcademyCalendarPage() {
  const { hasAcademy } = useAcademyDashboard();
  const [view, setView] = useState<ViewMode>('month');
  const [anchor, setAnchor] = useState(new Date());
  const [sessions, setSessions] = useState<AcademyTodaySession[] | null>(null);
  const [holidays, setHolidays] = useState<EffectiveHolidays>({ governmentHolidays: [], academyHolidays: [] });
  const [teachers, setTeachers] = useState<AcademyActiveTeacher[]>([]);
  const [batches, setBatches] = useState<AcademyManagedBatch[]>([]);
  const [loadError, setLoadError] = useState(false);

  const [typeFilter, setTypeFilter] = useState<'all' | 'classes' | 'holidays' | 'cancellations'>('all');
  const [tutorId, setTutorId] = useState('');
  const [batchId, setBatchId] = useState('');

  const range = useMemo(() => {
    if (view === 'month') return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
    if (view === 'week') {
      const start = startOfWeek(anchor);
      return { from: start, to: new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000) };
    }
    if (view === 'day') {
      const start = new Date(anchor);
      start.setHours(0, 0, 0, 0);
      return { from: start, to: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
    }
    // list: next 30 days from today
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { from: start, to: new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000) };
  }, [view, anchor]);

  const load = useCallback(async () => {
    if (hasAcademy === false) {
      setSessions([]);
      return;
    }
    setLoadError(false);
    try {
      const [sessionRows, holidayRows, teacherRows, batchRows] = await Promise.all([
        api.get<AcademyTodaySession[]>(
          `/academy/me/sessions?from=${range.from.toISOString()}&to=${range.to.toISOString()}`,
        ),
        api.get<EffectiveHolidays>(
          `/academy/me/holidays?from=${range.from.toISOString().slice(0, 10)}&to=${range.to.toISOString().slice(0, 10)}`,
        ).catch(() => ({ governmentHolidays: [], academyHolidays: [] }) as EffectiveHolidays),
        api.get<AcademyActiveTeacher[]>('/academy/me/teachers/active').catch(() => [] as AcademyActiveTeacher[]),
        api.get<AcademyManagedBatch[]>('/academy/me/batches').catch(() => [] as AcademyManagedBatch[]),
      ]);
      setSessions(sessionRows);
      setHolidays(holidayRows);
      setTeachers(teacherRows);
      setBatches(batchRows);
    } catch {
      setLoadError(true);
    }
  }, [hasAcademy, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const items: CalendarItem[] = useMemo(() => {
    const result: CalendarItem[] = [];
    for (const s of sessions ?? []) {
      if (tutorId && s.tutorId !== tutorId) continue;
      if (batchId && s.batchId !== batchId) continue;
      const isCancelled = s.status === 'cancelled';
      result.push({
        id: s.id,
        date: new Date(s.scheduledStartUtc),
        kind: isCancelled ? 'cancellation' : 'class',
        title: s.batchTitle,
        subtitle: isCancelled
          ? cancellationReasonLabel(s)
          : `${sessionTime(s)} · ${s.tutorDisplayName ?? 'Teacher'}`,
        href: `/academy/batches/${s.batchId}`,
        tutorId: s.tutorId,
        batchId: s.batchId,
      });
    }
    for (const h of [...holidays.governmentHolidays, ...holidays.academyHolidays]) {
      result.push({
        id: h.id,
        date: new Date(h.start_date),
        kind: 'holiday',
        title: h.name,
        subtitle: h.type === 'government_holiday' ? 'Tamil Nadu Government Holiday' : 'Academy Holiday',
        href: '/academy/holidays',
        tutorId: null,
        batchId: null,
      });
    }
    return result
      .filter((i) => typeFilter === 'all' || (typeFilter === 'classes' && i.kind === 'class') || (typeFilter === 'holidays' && i.kind === 'holiday') || (typeFilter === 'cancellations' && i.kind === 'cancellation'))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [sessions, holidays, tutorId, batchId, typeFilter]);

  function itemIcon(kind: ItemKind) {
    if (kind === 'holiday') return PartyPopper;
    if (kind === 'cancellation') return CalendarOff;
    return GraduationCap;
  }

  function navigate(direction: -1 | 1) {
    const next = new Date(anchor);
    if (view === 'month') next.setMonth(next.getMonth() + direction);
    else if (view === 'week') next.setDate(next.getDate() + direction * 7);
    else if (view === 'day') next.setDate(next.getDate() + direction);
    setAnchor(next);
  }

  const monthCells = useMemo(() => {
    if (view !== 'month') return [];
    const first = startOfMonth(anchor);
    const gridStart = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => new Date(gridStart.getTime() + i * 24 * 60 * 60 * 1000));
  }, [view, anchor]);

  return (
    <div>
      <AcademySetupBanner />
      <AcademyPageIntro
        eyebrow="Academy Dashboard"
        title="Calendar"
        description="Classes, holidays, and cancellations across your academy."
      />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-800">
            {(['month', 'week', 'day', 'list'] as ViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                  view === v
                    ? 'bg-brand-600 text-white'
                    : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900',
                )}
              >
                {v}
              </button>
            ))}
          </div>
          {view !== 'list' && (
            <>
              <button type="button" onClick={() => navigate(-1)} className="rounded-md border border-neutral-200 p-1.5 text-neutral-500 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900" aria-label="Previous">
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {view === 'month'
                  ? anchor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
                  : anchor.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <button type="button" onClick={() => navigate(1)} className="rounded-md border border-neutral-200 p-1.5 text-neutral-500 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900" aria-label="Next">
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)} className="h-9 text-sm">
            <option value="all">All</option>
            <option value="classes">Classes</option>
            <option value="holidays">Holidays</option>
            <option value="cancellations">Cancellations</option>
          </Select>
          <Select value={tutorId} onChange={(e) => setTutorId(e.target.value)} className="h-9 text-sm">
            <option value="">All teachers</option>
            {teachers.map((t) => (
              <option key={t.tutorId} value={t.tutorId}>
                {t.displayName ?? 'Teacher'}
              </option>
            ))}
          </Select>
          <Select value={batchId} onChange={(e) => setBatchId(e.target.value)} className="h-9 text-sm">
            <option value="">All batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mt-6">
        {loadError ? (
          <ErrorState description="Could not load the calendar. Check your connection and try again." onRetry={() => void load()} />
        ) : sessions === null ? (
          <CardSkeleton />
        ) : items.length === 0 ? (
          <AcademyCard className="flex flex-col items-center gap-2 py-10 text-center">
            <CalendarRange className="h-6 w-6 text-neutral-400" aria-hidden />
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">Nothing scheduled</p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Your classes, holidays and cancellations will appear here.
            </p>
          </AcademyCard>
        ) : view === 'month' ? (
          <div className="grid grid-cols-7 gap-1.5">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="text-center text-xs font-semibold uppercase text-neutral-400">
                {d}
              </div>
            ))}
            {monthCells.map((cellDate) => {
              const dayItems = items.filter((i) => sameDay(i.date, cellDate));
              const inMonth = cellDate.getMonth() === anchor.getMonth();
              return (
                <div
                  key={cellDate.toISOString()}
                  className={cn(
                    'min-h-[84px] rounded-lg border border-neutral-100 p-1.5 dark:border-neutral-800',
                    !inMonth && 'opacity-40',
                    sameDay(cellDate, new Date()) && 'border-brand-400 bg-brand-50/40 dark:bg-brand-500/5',
                  )}
                >
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{cellDate.getDate()}</p>
                  <div className="mt-1 space-y-0.5">
                    {dayItems.slice(0, 3).map((i) => (
                      <p
                        key={i.id}
                        className={cn(
                          'truncate rounded px-1 py-0.5 text-[10px] font-medium',
                          i.kind === 'holiday' && 'bg-info-bg text-info dark:bg-info/15 dark:text-info-dark',
                          i.kind === 'cancellation' && 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
                          i.kind === 'class' && 'bg-success-bg text-success dark:bg-success/15 dark:text-success-dark',
                        )}
                      >
                        {i.title}
                      </p>
                    ))}
                    {dayItems.length > 3 && (
                      <p className="text-[10px] text-neutral-400">+{dayItems.length - 3} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const Icon = itemIcon(item.kind);
              const row = (
                <AcademyCard interactive={!!item.href} className="flex items-center gap-3">
                  <Icon className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                      {item.date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </p>
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">{item.title}</p>
                    {item.subtitle && <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{item.subtitle}</p>}
                  </div>
                  {item.kind !== 'class' && <StatusBadge status={item.kind === 'holiday' ? 'holiday' : 'cancelled'} />}
                </AcademyCard>
              );
              return item.href ? (
                <Link key={item.id} href={item.href}>
                  {row}
                </Link>
              ) : (
                <div key={item.id}>{row}</div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
