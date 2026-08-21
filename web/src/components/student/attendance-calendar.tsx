'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AttendanceHistoryEntry } from '@/lib/types';
import { AcademicCard } from '@/components/student';
import { cn } from '@/lib/cn';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const DOT_TONE: Record<AttendanceHistoryEntry['status'], string> = {
  present: 'bg-success',
  late: 'bg-warning',
  absent: 'bg-error',
};

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA');
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** A month grid marking each day with a class on it — Attendance's
 *  calendar view, built purely from the already-fetched history (no new
 *  endpoint). Defaults to the most recent month with any recorded
 *  attendance, since that's more useful than always opening on the
 *  current (possibly empty) calendar month. */
export function AttendanceCalendar({ history }: { history: AttendanceHistoryEntry[] }) {
  const byDay = useMemo(() => {
    const map = new Map<string, AttendanceHistoryEntry['status'][]>();
    for (const row of history) {
      const key = dayKey(row.scheduled_start_utc);
      const list = map.get(key) ?? [];
      list.push(row.status);
      map.set(key, list);
    }
    return map;
  }, [history]);

  const mostRecent = useMemo(() => {
    if (history.length === 0) return new Date();
    return history
      .map((row) => new Date(row.scheduled_start_utc))
      .sort((a, b) => b.getTime() - a.getTime())[0];
  }, [history]);

  const [cursor, setCursor] = useState(() => new Date(mostRecent.getFullYear(), mostRecent.getMonth(), 1));

  const label = cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const firstWeekday = cursor.getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const todayKey = new Date().toLocaleDateString('en-CA');
  const isCurrentMonth = monthKey(cursor) === monthKey(new Date());

  const cells: ({ day: number; key: string } | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), i + 1);
      return { day: i + 1, key: date.toLocaleDateString('en-CA') };
    }),
  ];

  return (
    <AcademicCard>
      <div className="mb-4 flex items-center justify-between">
        <p className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">{label}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_LABELS.map((w, i) => (
          <div key={i} className="pb-1 text-[11px] font-semibold uppercase text-neutral-400 dark:text-neutral-500">
            {w}
          </div>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <div key={`empty-${i}`} />;
          const statuses = byDay.get(cell.key) ?? [];
          const primary = statuses.includes('absent')
            ? 'absent'
            : statuses.includes('late')
              ? 'late'
              : statuses.includes('present')
                ? 'present'
                : null;
          return (
            <div
              key={cell.key}
              className={cn(
                'flex h-9 flex-col items-center justify-center rounded-lg text-sm',
                cell.key === todayKey && isCurrentMonth
                  ? 'border border-brand-300 dark:border-brand-500/40'
                  : 'border border-transparent',
              )}
            >
              <span className="text-neutral-700 dark:text-neutral-300">{cell.day}</span>
              {primary && <span className={cn('mt-0.5 h-1.5 w-1.5 rounded-full', DOT_TONE[primary])} aria-hidden />}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-neutral-100 pt-3 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
          Present
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden />
          Late
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-error" aria-hidden />
          Absent
        </span>
      </div>
    </AcademicCard>
  );
}
