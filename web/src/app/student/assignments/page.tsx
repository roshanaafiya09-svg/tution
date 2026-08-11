'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, User } from 'lucide-react';
import { api, apiGetPublic } from '@/lib/api';
import type { Batch, StudentAssignmentSummary, Subject } from '@/lib/types';
import { Card, PageHeader, EmptyState, CardSkeleton, ErrorState, StatusBadge } from '@/components/ui';

type AssignmentStatus = 'overdue' | 'due_soon' | 'not_started' | 'submitted' | 'graded';

function statusFor(a: StudentAssignmentSummary): AssignmentStatus {
  if (a.grade !== null) return 'graded';
  if (a.submission_id) return 'submitted';
  const dueIn = new Date(a.due_at_utc).getTime() - Date.now();
  if (dueIn < 0) return 'overdue';
  if (dueIn <= 24 * 60 * 60 * 1000) return 'due_soon';
  return 'not_started';
}

function formatDue(dueAtUtc: string): string {
  return new Date(dueAtUtc).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function StudentAssignmentsPage() {
  const [assignments, setAssignments] = useState<StudentAssignmentSummary[] | null>(null);
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    setAssignments(null);
    setBatches(null);
    setSubjects(null);
    Promise.all([
      api.get<StudentAssignmentSummary[]>('/assignments/me'),
      api.get<Batch[]>('/batches/enrolled'),
      apiGetPublic<Subject[]>('/catalog/subjects'),
    ])
      .then(([a, b, s]) => {
        setAssignments(a);
        setBatches(b);
        setSubjects(s);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loading = assignments === null || batches === null || subjects === null;

  const sorted = (assignments ?? [])
    .slice()
    .sort((a, b) => {
      const aNeedsAction = !a.submission_id;
      const bNeedsAction = !b.submission_id;
      if (aNeedsAction !== bNeedsAction) return aNeedsAction ? -1 : 1;
      return new Date(a.due_at_utc).getTime() - new Date(b.due_at_utc).getTime();
    });

  return (
    <div>
      <PageHeader title="Assignments" description="Homework across all your batches." />

      {loading ? (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : loadError ? (
        <ErrorState description="Could not load your assignments. Check your connection and try again." onRetry={load} />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="You're all caught up 🎉"
          description="New assignments from your tutors will appear here."
        />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
          {sorted.map((a) => {
            const batch = batches!.find((b) => b.id === a.batch_id);
            const subject = batch ? subjects!.find((s) => s.id === batch.subject_id)?.name_i18n.en : undefined;
            return (
              <Link
                key={a.id}
                href={`/student/assignments/${a.id}`}
                className="flex items-center justify-between gap-3 px-6 py-4 hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-neutral-900 dark:text-neutral-50">{a.title}</p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {subject ? `${subject} · ` : ''}
                    {a.batch_title} · Due {formatDue(a.due_at_utc)}
                  </p>
                  {batch?.tutor_display_name && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-400 dark:text-neutral-500">
                      <User className="h-3 w-3" aria-hidden />
                      {batch.tutor_display_name}
                    </p>
                  )}
                </div>
                <StatusBadge status={statusFor(a)} />
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}
