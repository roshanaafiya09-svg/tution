'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CalendarCheck, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import type { AttendanceHistoryEntry, AttendanceSummary, ParentLink } from '@/lib/types';
import { Card, PageHeader, EmptyState, PageLoading, StatusBadge, InlineError } from '@/components/ui';

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

  return (
    <div>
      <PageHeader
        title={displayName ? `${displayName}'s attendance` : 'Attendance'}
        description="Attendance across all of their batches."
        back={{ href: `/parent/child/${studentId}`, label: 'Back' }}
      />

      {error && (
        <div className="mb-4">
          <InlineError>{error}</InlineError>
        </div>
      )}

      {loading ? (
        <PageLoading />
      ) : (
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-4">
            <Card className="flex items-start gap-3">
              <CalendarCheck className="mt-0.5 h-5 w-5 text-brand-500 dark:text-brand-300" aria-hidden />
              <div>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">Attendance</p>
                <p className="mt-0.5 font-display text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
                  {summary.rate ?? '—'}
                  {summary.rate !== null && '%'}
                </p>
              </div>
            </Card>
            <Card className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" aria-hidden />
              <div>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">Present</p>
                <p className="mt-0.5 font-display text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
                  {summary.present}
                </p>
              </div>
            </Card>
            <Card className="flex items-start gap-3">
              <XCircle className="mt-0.5 h-5 w-5 text-error" aria-hidden />
              <div>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">Absent</p>
                <p className="mt-0.5 font-display text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
                  {summary.absent}
                </p>
              </div>
            </Card>
            <Card className="flex items-start gap-3">
              <Clock className="mt-0.5 h-5 w-5 text-warning" aria-hidden />
              <div>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">Late</p>
                <p className="mt-0.5 font-display text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
                  {summary.late}
                </p>
              </div>
            </Card>
          </div>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">History</h2>
            {history.length === 0 ? (
              <EmptyState
                icon={CalendarCheck}
                title="No attendance records yet"
                description="Attendance will show up here once a class has been marked."
              />
            ) : (
              <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
                {history.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 px-6 py-3">
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
              </Card>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
