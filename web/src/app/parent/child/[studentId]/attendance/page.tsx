'use client';

import { useParams } from 'next/navigation';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import type { AttendanceHistoryEntry, AttendanceSummary, ParentLink } from '@/lib/types';
import { PageHeader, CardSkeleton, StatusBadge, QueryBoundary } from '@/components/ui';
import { useApiQuery } from '@/lib/query';
import { ParentCard, ParentEmptyState, ParentSectionHeader, ProgressRing } from '@/components/parent';

export default function ChildAttendancePage() {
  const { studentId } = useParams<{ studentId: string }>();
  // Summary, history and the child's name are one page: if any request fails the
  // page says so (a 403 here usually means the parent-consent link isn't active) —
  // it never shows a 0% summary or an empty history for a request that failed.
  const query = useApiQuery(async () => {
    const [links, summary, history] = await Promise.all([
      api.get<ParentLink[]>('/parent-links/me'),
      api.get<AttendanceSummary>(`/attendance/student/${studentId}/summary`),
      api.get<AttendanceHistoryEntry[]>(`/attendance/student/${studentId}/history`),
    ]);
    const link = links.find((l) => l.student_id === studentId);
    return { summary, history, displayName: link?.student_display_name ?? null };
  }, [studentId]);
  const name = query.data?.displayName ?? `Student ${studentId.slice(0, 8)}`;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Attendance"
        title={`${name}'s attendance`}
        description="Attendance across all of their batches."
        back={{ href: `/parent/child/${studentId}`, label: 'Back' }}
      />

      <QueryBoundary
        query={query}
        what="this child's attendance"
        loading={
          <div className="space-y-4">
            <CardSkeleton className="h-40 rounded-2xl" />
            <CardSkeleton className="rounded-2xl" />
          </div>
        }
      >
        {({ summary, history }) => (
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
      </QueryBoundary>
    </div>
  );
}
