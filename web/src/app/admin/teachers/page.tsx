'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import { api } from '@/lib/api';
import { impersonationStore } from '@/lib/impersonation';
import type { AdminTeacherSummary, ImpersonationResponse } from '@/lib/types';
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

export default function AdminTeachersPage() {
  const router = useRouter();
  const [teachers, setTeachers] = useState<AdminTeacherSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminTeacherSummary | null>(null);

  function load(query?: string) {
    api
      .get<AdminTeacherSummary[]>(`/admin/teachers${query ? `?q=${encodeURIComponent(query)}` : ''}`)
      .then(setTeachers)
      .catch(() => setError('Could not load teachers.'));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function viewDashboard(teacher: AdminTeacherSummary) {
    setViewingId(teacher.id);
    try {
      const res = await api.post<ImpersonationResponse>(`/admin/impersonate/${teacher.id}`);
      impersonationStore.start(res.target, res.accessToken);
      router.push('/dashboard');
    } catch {
      setError(`Could not open ${teacher.displayName ?? 'this teacher'}'s dashboard.`);
      setViewingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await api.delete(`/admin/users/${deleteTarget.id}`);
    setTeachers((prev) => prev?.filter((t) => t.id !== deleteTarget.id) ?? null);
  }

  if (error) {
    return <ErrorState description={error} onRetry={() => { setError(null); load(q); }} />;
  }

  if (teachers === null) {
    return <PageLoading />;
  }

  return (
    <div>
      <PageHeader title="Teachers" description="Every tutor account on the platform." />

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

      {teachers.length === 0 ? (
        <EmptyState icon={Users} title="No teachers found" description="No tutor accounts match this search." />
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Contact</TH>
                <TH>Status</TH>
                <TH>Verification</TH>
                <TH>Joined</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {teachers.map((teacher) => (
                <TR key={teacher.id}>
                  <TD className="font-medium text-neutral-900 dark:text-neutral-50">
                    {teacher.displayName ?? '—'}
                  </TD>
                  <TD>{teacher.email ?? teacher.phoneE164}</TD>
                  <TD>
                    <StatusBadge status={teacher.status} />
                  </TD>
                  <TD>
                    <StatusBadge status={teacher.verificationStatus ?? 'pending'} />
                  </TD>
                  <TD>{new Date(teacher.createdAt).toLocaleDateString()}</TD>
                  <TD>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void viewDashboard(teacher)}
                        loading={viewingId === teacher.id}
                      >
                        View Dashboard
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setDeleteTarget(teacher)}>
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

function toDeleteTarget(teacher: AdminTeacherSummary | null): DeleteUserTarget | null {
  if (!teacher) return null;
  return {
    id: teacher.id,
    label: teacher.displayName ?? teacher.email ?? teacher.phoneE164,
    confirmValue: teacher.email ?? teacher.phoneE164,
    confirmFieldLabel: teacher.email ? 'email' : 'phone number',
  };
}
