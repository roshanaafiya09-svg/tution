'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { UserCheck } from 'lucide-react';
import { api } from '@/lib/api';
import type { AttendanceRow } from '@/lib/types';
import { StatusBadge, Button, CardSkeleton, ErrorState, useToast } from '@/components/ui';
import { TeacherPageHeader, AcademicCard, EmptyPanel, StudentCard } from '@/components/dashboard';

const STATUSES = ['present', 'late', 'absent'] as const;

export default function SessionAttendancePage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [rows, setRows] = useState<AttendanceRow[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoadError(null);
    return api.get<AttendanceRow[]>(`/attendance/session/${id}`).then(setRows).catch((err: unknown) => setLoadError(err ?? true));
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

  async function markAllPresent() {
    if (!rows) return;
    try {
      await Promise.all(
        rows
          .filter((row) => row.enrollment_status !== 'left')
          .map((row) => api.post(`/attendance/session/${id}/mark`, { studentId: row.student_id, status: 'present' })),
      );
      await load();
    } catch {
      toast({ title: 'Could not update attendance', variant: 'error' });
    }
  }

  return (
    <div>
      <TeacherPageHeader
        eyebrow="Classroom management"
        title="Attendance"
        description="Every enrolled student is shown here — a tapped Join pre-fills Present, but you have the final say."
        back={{ href: '/dashboard/batches', label: 'Batches' }}
        action={
          rows && rows.length > 0 ? (
            <Button variant="secondary" size="sm" onClick={() => void markAllPresent()}>
              Mark all Present
            </Button>
          ) : undefined
        }
      />

      <div className="mt-8">
        {loadError ? (
          <ErrorState error={loadError} what="attendance for this session" onRetry={load} />
        ) : rows === null ? (
          <CardSkeleton />
        ) : rows.length === 0 ? (
          <EmptyPanel
            icon={UserCheck}
            title="No students enrolled"
            description="Enroll students in this batch to take attendance for this class."
          />
        ) : (
          <AcademicCard className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
            {rows.map((row) => (
              <StudentCard
                key={row.student_id}
                name={row.display_name ?? row.student_id.slice(0, 8)}
                meta={
                  row.enrollment_status === 'left'
                    ? 'Removed from this batch — record kept'
                    : row.method === 'join_tap'
                      ? 'Tapped Join'
                      : row.method === 'manual'
                        ? 'Marked by you'
                        : 'Not marked yet'
                }
                badge={<StatusBadge status={row.status ?? 'unmarked'} />}
                className="flex-wrap"
                action={
                  row.enrollment_status === 'left' ? undefined : (
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
                  )
                }
              />
            ))}
          </AcademicCard>
        )}
      </div>
    </div>
  );
}
