'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap } from 'lucide-react';
import { api } from '@/lib/api';
import { impersonationStore } from '@/lib/impersonation';
import type { AdminStudentSummary, ImpersonationResponse } from '@/lib/types';
import {
  PageHeader,
  Card,
  TableContainer,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  EmptyState,
  StatusBadge,
  Button,
  Input,
  PageLoading,
  ErrorState,
} from '@/components/ui';
import { DeleteUserDialog, type DeleteUserTarget } from '@/components/admin/delete-user-dialog';

export default function AdminStudentsPage() {
  const router = useRouter();
  const [students, setStudents] = useState<AdminStudentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminStudentSummary | null>(null);

  function load(query?: string) {
    api
      .get<AdminStudentSummary[]>(`/admin/students${query ? `?q=${encodeURIComponent(query)}` : ''}`)
      .then(setStudents)
      .catch(() => setError('Could not load students.'));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function viewDashboard(student: AdminStudentSummary) {
    setViewingId(student.id);
    try {
      const res = await api.post<ImpersonationResponse>(`/admin/impersonate/${student.id}`);
      impersonationStore.start(res.target, res.accessToken);
      router.push(`/admin/students/${student.id}/dashboard`);
    } catch {
      setError(`Could not open ${student.displayName ?? 'this student'}'s dashboard.`);
      setViewingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await api.delete(`/admin/users/${deleteTarget.id}`);
    setStudents((prev) => prev?.filter((s) => s.id !== deleteTarget.id) ?? null);
  }

  if (error) {
    return <ErrorState description={error} onRetry={() => { setError(null); load(q); }} />;
  }

  if (students === null) {
    return <PageLoading />;
  }

  return (
    <div>
      <PageHeader title="Students" description="Every student account on the platform." />

      <Card className="mb-4 p-4">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') load(q);
          }}
          placeholder="Search by name, email, or phone"
        />
      </Card>

      {students.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No students found" description="No student accounts match this search." />
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Contact</TH>
                <TH>Status</TH>
                <TH>Grade</TH>
                <TH>Joined</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {students.map((student) => (
                <TR key={student.id}>
                  <TD className="font-medium text-neutral-900 dark:text-neutral-50">
                    {student.displayName ?? '—'}
                  </TD>
                  <TD>{student.email ?? student.phoneE164}</TD>
                  <TD>
                    <StatusBadge status={student.status} />
                  </TD>
                  <TD>{student.gradeLevel ?? '—'}</TD>
                  <TD>{new Date(student.createdAt).toLocaleDateString()}</TD>
                  <TD>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void viewDashboard(student)}
                        loading={viewingId === student.id}
                      >
                        View Dashboard
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setDeleteTarget(student)}>
                        Delete
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      )}

      <DeleteUserDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        target={toDeleteTarget(deleteTarget)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function toDeleteTarget(student: AdminStudentSummary | null): DeleteUserTarget | null {
  if (!student) return null;
  return {
    id: student.id,
    label: student.displayName ?? student.email ?? student.phoneE164,
    confirmValue: student.email ?? student.phoneE164,
    confirmFieldLabel: student.email ? 'email' : 'phone number',
  };
}
