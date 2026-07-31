'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { AttendanceRow } from '@/lib/types';
import { Card, PageHeader, EmptyState, StatusBadge, Button } from '@/components/ui';

const STATUSES = ['present', 'late', 'absent'] as const;

export default function SessionAttendancePage() {
  const { id } = useParams<{ id: string }>();
  const [rows, setRows] = useState<AttendanceRow[] | null>(null);

  const load = useCallback(async () => {
    setRows(await api.get<AttendanceRow[]>(`/attendance/session/${id}`));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mark(studentId: string, status: (typeof STATUSES)[number]) {
    await api.post(`/attendance/session/${id}/mark`, { studentId, status });
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Attendance"
        description="Students who tapped Join are marked automatically — override anything that's wrong."
      />

      {rows === null ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No attendance recorded yet"
          description="Attendance appears here as students join the class."
        />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between px-6 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  {row.display_name ?? row.student_id.slice(0, 8)}
                </p>
                <p className="text-xs text-neutral-500">
                  {row.method === 'join_tap' ? 'Tapped Join' : 'Marked by you'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={row.status} />
                <div className="flex gap-1">
                  {STATUSES.map((status) => (
                    <Button
                      key={status}
                      variant="secondary"
                      onClick={() => void mark(row.student_id, status)}
                      className={row.status === status ? 'border-brand-500 text-brand-700' : ''}
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
