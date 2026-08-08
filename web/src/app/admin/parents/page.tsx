'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';
import { api } from '@/lib/api';
import { impersonationStore } from '@/lib/impersonation';
import type { AdminParentSummary, ImpersonationResponse } from '@/lib/types';
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

export default function AdminParentsPage() {
  const router = useRouter();
  const [parents, setParents] = useState<AdminParentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminParentSummary | null>(null);

  function load(query?: string) {
    api
      .get<AdminParentSummary[]>(`/admin/parents${query ? `?q=${encodeURIComponent(query)}` : ''}`)
      .then(setParents)
      .catch(() => setError('Could not load parents.'));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function viewDashboard(parent: AdminParentSummary) {
    setViewingId(parent.id);
    try {
      const res = await api.post<ImpersonationResponse>(`/admin/impersonate/${parent.id}`);
      impersonationStore.start(res.target, res.accessToken);
      router.push('/parent');
    } catch {
      setError(`Could not open ${parent.email ?? 'this parent'}'s dashboard.`);
      setViewingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await api.delete(`/admin/users/${deleteTarget.id}`);
    setParents((prev) => prev?.filter((p) => p.id !== deleteTarget.id) ?? null);
  }

  if (error) {
    return <ErrorState description={error} onRetry={() => { setError(null); load(q); }} />;
  }

  if (parents === null) {
    return <PageLoading />;
  }

  return (
    <div>
      <PageHeader title="Parents" description="Every parent account on the platform." />

      <Card className="mb-4 p-4">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') load(q);
          }}
          placeholder="Search by email or phone"
        />
      </Card>

      {parents.length === 0 ? (
        <EmptyState icon={Heart} title="No parents found" description="No parent accounts match this search." />
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <TR>
                <TH>Contact</TH>
                <TH>Status</TH>
                <TH>Linked children</TH>
                <TH>Joined</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {parents.map((parent) => (
                <TR key={parent.id}>
                  <TD className="font-medium text-neutral-900 dark:text-neutral-50">
                    {parent.email ?? parent.phoneE164}
                  </TD>
                  <TD>
                    <StatusBadge status={parent.status} />
                  </TD>
                  <TD>{parent.linkedChildren}</TD>
                  <TD>{new Date(parent.createdAt).toLocaleDateString()}</TD>
                  <TD>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void viewDashboard(parent)}
                        loading={viewingId === parent.id}
                      >
                        View Dashboard
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setDeleteTarget(parent)}>
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

function toDeleteTarget(parent: AdminParentSummary | null): DeleteUserTarget | null {
  if (!parent) return null;
  return {
    id: parent.id,
    label: parent.email ?? parent.phoneE164,
    confirmValue: parent.email ?? parent.phoneE164,
    confirmFieldLabel: parent.email ? 'email' : 'phone number',
  };
}
