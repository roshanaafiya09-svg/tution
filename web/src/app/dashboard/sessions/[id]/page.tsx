'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { UserCheck, MousePointerClick, PenLine } from 'lucide-react';
import { api } from '@/lib/api';
import type { AttendanceRow } from '@/lib/types';
import { Card, PageHeader, EmptyState, StatusBadge, Button, CardSkeleton, ErrorState, useToast } from '@/components/ui';

const STATUSES = ['present', 'late', 'absent'] as const;

export default function SessionAttendancePage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [rows, setRows] = useState<AttendanceRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    return api.get<AttendanceRow[]>(`/attendance/session/${id}`).then(setRows).catch(() => setLoadError(true));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function mark(studentId: string, status: (typeof STATUSES)[number]) {
    try {
      await api.post(`/attendance/session/${id}/mark`, { studentId, status });
      await load();
    } catch {
      toast({ title: 'Could not update attendance', variant: 'error' });
    }
  }

  return (
    <div>
      <PageHeader
        title="Attendance"
        description="Students who tapped Join are marked automatically — override anything that's wrong."
        back={{ href: '/dashboard/batches', label: 'Batches' }}
      />

      {loadError ? (
        <ErrorState description="Could not load attendance for this session. Check your connection and try again." onRetry={load} />
      ) : rows === null ? (
        <CardSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title="No attendance recorded yet"
          description="Attendance appears here as students join the class."
        />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
          {rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                  {row.display_name ?? row.student_id.slice(0, 8)}
                </p>
                <p className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                  {row.method === 'join_tap' ? (
                    <MousePointerClick className="h-3 w-3" aria-hidden />
                  ) : (
                    <PenLine className="h-3 w-3" aria-hidden />
                  )}
                  {row.method === 'join_tap' ? 'Tapped Join' : 'Marked by you'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={row.status} />
                <div className="flex gap-1">
                  {STATUSES.map((status) => (
                    <Button
                      key={status}
                      variant={row.status === status ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => void mark(row.student_id, status)}
                      className="capitalize"
                    >
                      {status}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
