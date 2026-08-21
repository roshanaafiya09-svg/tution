'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { api } from '@/lib/api';
import type { AttendanceHistoryEntry, AttendanceSummary, Batch } from '@/lib/types';
import { EmptyState, CardSkeleton, ErrorState } from '@/components/ui';
import { PageIntro, AttendanceDetail, type HistoryRowWithBatch } from '@/components/student';

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
    <div className="space-y-8">
      <PageIntro eyebrow="How am I doing" title="Attendance" description="Your attendance across all your batches." />

      {loading ? (
        <div className="space-y-8">
          <CardSkeleton className="h-48 rounded-2xl" />
          <CardSkeleton className="rounded-2xl" />
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
        <AttendanceDetail summary={summary} history={history} />
      )}
    </div>
  );
}
