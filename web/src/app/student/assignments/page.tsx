'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { api } from '@/lib/api';
import type { StudentAssignmentSummary } from '@/lib/types';
import { Card, PageHeader, EmptyState, PageLoading, StatusBadge } from '@/components/ui';

function statusFor(a: StudentAssignmentSummary): 'due' | 'graded' | 'pending' {
  if (a.grade !== null) return 'graded';
  if (a.submission_id) return 'pending';
  return 'due';
}

export default function StudentAssignmentsPage() {
  const [assignments, setAssignments] = useState<StudentAssignmentSummary[] | null>(null);

  useEffect(() => {
    void api.get<StudentAssignmentSummary[]>('/assignments/me').then(setAssignments);
  }, []);

  return (
    <div>
      <PageHeader title="Assignments" description="Homework across all your batches." />

      {assignments === null ? (
        <PageLoading />
      ) : assignments.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No assignments yet" description="Nothing assigned so far." />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
          {assignments
            .slice()
            .sort((a, b) => new Date(a.due_at_utc).getTime() - new Date(b.due_at_utc).getTime())
            .map((a) => (
              <Link
                key={a.id}
                href={`/student/assignments/${a.id}`}
                className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-neutral-900 dark:text-neutral-50">{a.title}</p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {a.batch_title} · Due{' '}
                    {new Date(a.due_at_utc).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <StatusBadge status={statusFor(a)} />
              </Link>
            ))}
        </Card>
      )}
    </div>
  );
}
