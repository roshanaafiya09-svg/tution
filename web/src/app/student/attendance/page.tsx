'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import type { AttendanceHistoryEntry, AttendanceSummary, Batch } from '@/lib/types';
import { Card, PageHeader, EmptyState, CardSkeleton, ErrorState, StatusBadge } from '@/components/ui';
import { cn } from '@/lib/cn';

interface HistoryRowWithBatch extends AttendanceHistoryEntry {
  batch_title: string;
}

function barColor(rate: number): string {
  if (rate >= 90) return 'bg-success';
  if (rate >= 75) return 'bg-warning';
  return 'bg-error';
}

export default function StudentAttendancePage() {
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [history, setHistory] = useState<HistoryRowWithBatch[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    setSummary(null);
    setHistory(null);
    Promise.all([
      api.get<AttendanceSummary>('/attendance/me/summary'),
      api.get<AttendanceHistoryEntry[]>('/attendance/me/history'),
      api.get<Batch[]>('/batches/enrolled'),
    ])
      .then(([summaryRes, rows, batches]) => {
        setSummary(summaryRes);
        const titleByBatchId = new Map(batches.map((b) => [b.id, b.title]));
        setHistory(
          rows.map((row) => ({
            ...row,
            batch_title: titleByBatchId.get(row.batch_id) ?? 'Batch',
          })),
        );
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loading = summary === null || history === null;

  return (
    <div>
      <PageHeader title="Attendance" description="Your attendance across all your batches." />

      {loading ? (
        <div className="space-y-8">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : loadError ? (
        <ErrorState description="Could not load your attendance. Check your connection and try again." onRetry={load} />
      ) : summary.total === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No attendance records yet"
          description="Attendance will show up here once a class has been marked."
        />
      ) : (
        <div className="space-y-8">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">Attendance</p>
                <p className="mt-0.5 font-display text-4xl font-semibold text-neutral-900 dark:text-neutral-50">
                  {summary.rate ?? '—'}
                  {summary.rate !== null && '%'}
                </p>
              </div>
              <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success dark:text-success-dark" aria-hidden />
                  <div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">Present</p>
                    <p className="font-semibold text-neutral-900 dark:text-neutral-50">{summary.present}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-error dark:text-error-dark" aria-hidden />
                  <div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">Absent</p>
                    <p className="font-semibold text-neutral-900 dark:text-neutral-50">{summary.absent}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-warning dark:text-warning-dark" aria-hidden />
                  <div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">Late</p>
                    <p className="font-semibold text-neutral-900 dark:text-neutral-50">{summary.late}</p>
                  </div>
                </div>
              </div>
            </div>
            {summary.rate !== null && (
              <div
                className="mt-5 h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800"
                role="progressbar"
                aria-valuenow={summary.rate}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Attendance rate"
              >
                <div
                  className={cn('h-full rounded-full transition-all', barColor(summary.rate))}
                  style={{ width: `${summary.rate}%` }}
                />
              </div>
            )}
          </Card>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">History</h2>
            <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
              {history.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 px-6 py-3">
                  <div>
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{row.batch_title}</p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      {new Date(row.scheduled_start_utc).toLocaleString('en-IN', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
              ))}
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}
