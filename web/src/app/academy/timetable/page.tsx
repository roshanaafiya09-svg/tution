'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import type { AcademyActiveTeacher, AcademyManagedBatch, AcademyTodaySession, Subject } from '@/lib/types';
import { cancellationBadgeLabel, sessionTime } from '@/lib/session-labels';
import { CardSkeleton, ErrorState, Select, StatusBadge } from '@/components/ui';
import { AcademyCard, AcademyPageIntro, AcademySetupBanner } from '@/components/academy';
import { useAcademyDashboard } from '@/components/academy-shell';

const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function startOfWeek(offset: number): Date {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() + diffToMonday + offset * 7);
  return monday;
}

export default function AcademyTimetablePage() {
  const { hasAcademy } = useAcademyDashboard();
  const [weekOffset, setWeekOffset] = useState(0);
  const [sessions, setSessions] = useState<AcademyTodaySession[] | null>(null);
  const [teachers, setTeachers] = useState<AcademyActiveTeacher[]>([]);
  const [batches, setBatches] = useState<AcademyManagedBatch[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadError, setLoadError] = useState(false);

  const [tutorId, setTutorId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [day, setDay] = useState('');

  const weekStart = useMemo(() => startOfWeek(weekOffset), [weekOffset]);
  const weekEnd = useMemo(() => new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000), [weekStart]);

  const load = useCallback(async () => {
    if (hasAcademy === false) {
      setSessions([]);
      return;
    }
    setLoadError(false);
    try {
      const [sessionRows, teacherRows, batchRows, subjectRows] = await Promise.all([
        api.get<AcademyTodaySession[]>(
          `/academy/me/sessions?from=${weekStart.toISOString()}&to=${weekEnd.toISOString()}`,
        ),
        api.get<AcademyActiveTeacher[]>('/academy/me/teachers/active').catch(() => [] as AcademyActiveTeacher[]),
        api.get<AcademyManagedBatch[]>('/academy/me/batches').catch(() => [] as AcademyManagedBatch[]),
        api.get<Subject[]>('/catalog/subjects').catch(() => [] as Subject[]),
      ]);
      setSessions(sessionRows);
      setTeachers(teacherRows);
      setBatches(batchRows);
      setSubjects(subjectRows);
    } catch {
      setLoadError(true);
    }
  }, [hasAcademy, weekStart, weekEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  function subjectName(subjectId: string): string {
    return subjects.find((s) => s.id === subjectId)?.name_i18n.en ?? '';
  }

  const filtered = (sessions ?? []).filter((s) => {
    if (tutorId && s.tutorId !== tutorId) return false;
    if (batchId && s.batchId !== batchId) return false;
    if (subjectId && s.subjectId !== subjectId) return false;
    return true;
  });

  const byDay: AcademyTodaySession[][] = Array.from({ length: 7 }, (_, i) =>
    filtered
      .filter((s) => {
        const d = new Date(s.scheduledStartUtc);
        const dayIndex = (d.getDay() + 6) % 7; // Monday = 0
        return dayIndex === i;
      })
      .sort((a, b) => new Date(a.scheduledStartUtc).getTime() - new Date(b.scheduledStartUtc).getTime()),
  );

  const visibleDayIndices = day ? [DAY_LABELS.indexOf(day)] : [0, 1, 2, 3, 4, 5, 6];

  return (
    <div>
      <AcademySetupBanner />
      <AcademyPageIntro
        eyebrow="Academy Dashboard"
        title="Timetable"
        description="Every scheduled class across your academy, one week at a time."
      />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w - 1)}
            className="rounded-md border border-neutral-200 p-1.5 text-neutral-500 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {weekStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} –{' '}
            {new Date(weekEnd.getTime() - 1).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </span>
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w + 1)}
            className="rounded-md border border-neutral-200 p-1.5 text-neutral-500 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          {weekOffset !== 0 && (
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300"
            >
              This week
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
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
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="h-9 text-sm">
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name_i18n.en}
              </option>
            ))}
          </Select>
          <Select value={day} onChange={(e) => setDay(e.target.value)} className="h-9 text-sm">
            <option value="">All days</option>
            {DAY_LABELS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mt-6">
        {loadError ? (
          <ErrorState description="Could not load the timetable. Check your connection and try again." onRetry={() => void load()} />
        ) : sessions === null ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : filtered.length === 0 ? (
          <AcademyCard className="flex flex-col items-center gap-2 py-10 text-center">
            <Clock className="h-6 w-6 text-neutral-400" aria-hidden />
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">No classes scheduled</p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Your timetable will appear here once batches have schedules.
            </p>
          </AcademyCard>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${visibleDayIndices.length}, minmax(220px, 1fr))` }}>
            {visibleDayIndices.map((dayIndex) => (
              <div key={dayIndex}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  {DAY_LABELS[dayIndex]}
                </p>
                <div className="space-y-2">
                  {byDay[dayIndex].length === 0 ? (
                    <p className="text-xs text-neutral-400 dark:text-neutral-600">No classes</p>
                  ) : (
                    byDay[dayIndex].map((s) => (
                      <Link key={s.id} href={`/academy/batches/${s.batchId}`}>
                        <AcademyCard interactive className="p-3">
                          <p className="text-sm font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
                            {sessionTime(s)}
                          </p>
                          <p className="mt-0.5 truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
                            {s.batchTitle}
                          </p>
                          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                            {subjectName(s.subjectId) ? `${subjectName(s.subjectId)} · ` : ''}
                            {s.tutorDisplayName ?? 'Teacher'}
                          </p>
                          <div className="mt-1.5">
                            <StatusBadge status={cancellationBadgeLabel(s) ?? s.status} />
                          </div>
                        </AcademyCard>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
