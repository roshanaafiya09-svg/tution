'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import type { AttendanceHistoryEntry, AttendanceSummary, ParentLink } from '@/lib/types';
import { PageHeader, CardSkeleton, StatusBadge, InlineError } from '@/components/ui';
import { ParentCard, ParentEmptyState, ParentSectionHeader, ProgressRing } from '@/components/parent';

export default function ChildAttendancePage() {
  const { studentId } = useParams<{ studentId: string }>();
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [history, setHistory] = useState<AttendanceHistoryEntry[] | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<ParentLink[]>('/parent-links/me')
      .then((links) => {
        const link = links.find((l) => l.student_id === studentId);
        if (link?.student_display_name) setDisplayName(link.student_display_name);
      });

    api
      .get<AttendanceSummary>(`/attendance/student/${studentId}/summary`)
      .then(setSummary)
      .catch(() => setError('Could not load attendance — the consent link may not be active yet.'));
    api
      .get<AttendanceHistoryEntry[]>(`/attendance/student/${studentId}/history`)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [studentId]);

  const loading = summary === null || history === null;
  const name = displayName ?? `Student ${studentId.slice(0, 8)}`;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Attendance"
        title={`${name}'s attendance`}
        description="Attendance across all of their batches."
        back={{ href: `/parent/child/${studentId}`, label: 'Back' }}
      />

      {error && <InlineError>{error}</InlineError>}

      {loading ? (
        <div className="space-y-4">
          <CardSkeleton className="h-40 rounded-2xl" />
          <CardSkeleton className="rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-8">
          <ParentCard className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center">
            <ProgressRing value={summary.rate} tone="brand">
              <p className="font-display text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
                {summary.rate !== null ? `${summary.rate}%` : '—'}
              </p>
              <p className="text-xs text-neutral-400 dark:text-neutral-500">attendance</p>
            </ProgressRing>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success dark:text-success-dark" aria-hidden />
                <div>
                  <p className="font-display text-xl font-semibold text-neutral-900 dark:text-neutral-50">
                    {summary.present}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Present</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-error dark:text-error-dark" aria-hidden />
                <div>
                  <p className="font-display text-xl font-semibold text-neutral-900 dark:text-neutral-50">
                    {summary.absent}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Absent</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-warning dark:text-warning-dark" aria-hidden />
                <div>
                  <p className="font-display text-xl font-semibold text-neutral-900 dark:text-neutral-50">
                    {summary.late}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Late</p>
                </div>
              </div>
            </div>
          </ParentCard>

          <section>
            <ParentSectionHeader title="History" />
            {history.length === 0 ? (
              <ParentEmptyState
                icon={CheckCircle2}
                title="No attendance records yet"
                description="Attendance will show up here once a class has been marked."
              />
            ) : (
              <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200/70 bg-white shadow-sm dark:divide-neutral-800/80 dark:border-neutral-800/80 dark:bg-surface">
                {history.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      {new Date(row.scheduled_start_utc).toLocaleString('en-IN', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                    <StatusBadge status={row.status} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
