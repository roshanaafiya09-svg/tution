'use client';

import { useEffect, useState } from 'react';
import { CalendarCheck, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import type { AttendanceHistoryEntry, AttendanceSummary, Batch } from '@/lib/types';
import { Card, PageHeader, EmptyState, PageLoading, StatusBadge, StatCard } from '@/components/ui';

interface HistoryRowWithBatch extends AttendanceHistoryEntry {
  batch_title: string;
}

export default function StudentAttendancePage() {
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [history, setHistory] = useState<HistoryRowWithBatch[] | null>(null);

  useEffect(() => {
    void api.get<AttendanceSummary>('/attendance/me/summary').then(setSummary);

    void Promise.all([
      api.get<AttendanceHistoryEntry[]>('/attendance/me/history'),
      api.get<Batch[]>('/batches/enrolled'),
    ]).then(([rows, batches]) => {
      const titleByBatchId = new Map(batches.map((b) => [b.id, b.title]));
      setHistory(
        rows.map((row) => ({
          ...row,
          batch_title: titleByBatchId.get(row.batch_id) ?? 'Batch',
        })),
      );
    });
  }, []);

  const loading = summary === null || history === null;

  return (
    <div>
      <PageHeader title="Attendance" description="Your attendance across all your batches." />

      {loading ? (
        <PageLoading />
      ) : (
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard
              icon={CalendarCheck}
              label="Attendance"
              value={
                <>
                  {summary.rate ?? '—'}
                  {summary.rate !== null && '%'}
                </>
              }
            />
            <StatCard
              icon={CheckCircle2}
              label="Present"
              value={summary.present}
              iconClassName="text-success dark:text-success-dark"
            />
            <StatCard
              icon={XCircle}
              label="Absent"
              value={summary.absent}
              iconClassName="text-error dark:text-error-dark"
            />
            <StatCard
              icon={Clock}
              label="Late"
              value={summary.late}
              iconClassName="text-warning dark:text-warning-dark"
            />
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
                    <div>
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                        {row.batch_title}
                      </p>
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
            )}
          </section>
        </div>
      )}
    </div>
  );
}
