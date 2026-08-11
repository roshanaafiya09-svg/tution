'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { UserCheck } from 'lucide-react';
import { api } from '@/lib/api';
import type { AttendanceRow } from '@/lib/types';
import { EmptyState, StatusBadge, Button, CardSkeleton, ErrorState, useToast } from '@/components/ui';
import { TeacherPageHeader, AcademicCard, StudentCard } from '@/components/dashboard';

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
      <TeacherPageHeader
        eyebrow="Classroom management"
        title="Attendance"
        description="Students who tapped Join are marked automatically — override anything that's wrong."
        back={{ href: '/dashboard/batches', label: 'Batches' }}
      />

      <div className="mt-8">
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
          <AcademicCard className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
            {rows.map((row) => (
              <StudentCard
                key={row.id}
                name={row.display_name ?? row.student_id.slice(0, 8)}
                meta={row.method === 'join_tap' ? 'Tapped Join' : 'Marked by you'}
                badge={<StatusBadge status={row.status} />}
                className="flex-wrap"
                action={
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
                }
              />
            ))}
          </AcademicCard>
        )}
      </div>
    </div>
  );
}
