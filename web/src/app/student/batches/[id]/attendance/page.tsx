'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { api } from '@/lib/api';
import type { AttendanceHistoryEntry, AttendanceSummary } from '@/lib/types';
import { EmptyState, CardSkeleton, ErrorState } from '@/components/ui';
import { AttendanceDetail, useBatchWorkspace, type HistoryRowWithBatch } from '@/components/student';

/** GET /attendance/summary/batch/:id predates `AttendanceSummary` and keeps
 *  its own `attendanceRate` field name (see the doc comment on
 *  `AttendanceSummary` in lib/types.ts) — mapped to `rate` below so this tab
 *  can reuse the same `AttendanceDetail` component as the global page. */
interface BatchAttendanceSummary {
  total: number;
  present: number;
  late: number;
  absent: number;
  attendanceRate: number | null;
}

export default function BatchAttendanceTab() {
  const { batch } = useBatchWorkspace();
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [history, setHistory] = useState<HistoryRowWithBatch[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    setSummary(null);
    setHistory(null);
    Promise.all([
      api.get<BatchAttendanceSummary>(`/attendance/summary/batch/${batch.id}`),
      api.get<AttendanceHistoryEntry[]>('/attendance/me/history'),
    ])
      .then(([summaryRes, rows]) => {
        setSummary({
          total: summaryRes.total,
          present: summaryRes.present,
          late: summaryRes.late,
          absent: summaryRes.absent,
          rate: summaryRes.attendanceRate,
        });
        setHistory(
          rows.filter((row) => row.batch_id === batch.id).map((row) => ({ ...row, batch_title: batch.title })),
        );
      })
      .catch(() => setLoadError(true));
  }, [batch.id, batch.title]);

  useEffect(() => {
    load();
  }, [load]);

  if (summary === null || history === null) {
    return (
      <div className="space-y-8">
        <CardSkeleton className="h-48 rounded-2xl" />
        <CardSkeleton className="rounded-2xl" />
      </div>
    );
  }
  if (loadError) {
    return <ErrorState description="Could not load this batch's attendance. Check your connection and try again." onRetry={load} />;
  }
  if (summary.total === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No attendance records yet"
        description="Attendance will show up here once a class has been marked."
      />
    );
  }

  return <AttendanceDetail summary={summary} history={history} />;
}
