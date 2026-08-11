'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ClipboardList, User } from 'lucide-react';
import { api, apiGetPublic } from '@/lib/api';
import type { Batch, StudentAssignmentSummary, Subject } from '@/lib/types';
import { EmptyState, CardSkeleton, ErrorState, StatusBadge } from '@/components/ui';
import { PageIntro, SectionHeader, AcademicCard } from '@/components/student';
import { cn } from '@/lib/cn';

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

  function contextFor(a: StudentAssignmentSummary) {
    const batch = batches!.find((b) => b.id === a.batch_id);
    const subject = batch ? subjects!.find((s) => s.id === batch.subject_id)?.name_i18n.en : undefined;
    return { batch, subject };
  }

  const sorted = (assignments ?? []).slice().sort((a, b) => new Date(a.due_at_utc).getTime() - new Date(b.due_at_utc).getTime());
  const priority = sorted.filter((a) => statusFor(a) !== 'submitted' && statusFor(a) !== 'graded');
  const settled = sorted.filter((a) => statusFor(a) === 'submitted' || statusFor(a) === 'graded');
  const completeRatio = sorted.length > 0 ? Math.round((settled.length / sorted.length) * 100) : 0;

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="What do I need to do"
        title="Assignments"
        description="Homework across all your batches, action-needed first."
      />

      {loading ? (
        <div className="space-y-3">
          <CardSkeleton className="rounded-2xl" />
          <CardSkeleton className="rounded-2xl" />
          <CardSkeleton className="rounded-2xl" />
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
        <>
          <div className="flex items-center gap-4">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200/70 dark:bg-neutral-800">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-slow dark:bg-brand-400"
                style={{ width: `${completeRatio}%` }}
              />
            </div>
            <p className="shrink-0 text-sm font-medium text-neutral-500 dark:text-neutral-400">
              {settled.length} of {sorted.length} complete
            </p>
          </div>

          {priority.length > 0 && (
            <section>
              <SectionHeader eyebrow={`${priority.length} need${priority.length === 1 ? 's' : ''} action`} title="Needs your attention" />
              <div className="space-y-2">
                {priority.map((a) => {
                  const status = statusFor(a) as 'overdue' | 'due_soon' | 'not_started';
                  const { batch, subject } = contextFor(a);
                  return (
                    <Link
                      key={a.id}
                      href={`/student/assignments/${a.id}`}
                      className="group flex items-stretch gap-0 overflow-hidden rounded-xl border border-neutral-200/70 bg-white transition-all duration-base hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-sm dark:border-neutral-800/80 dark:bg-surface dark:hover:border-neutral-700"
                    >
                      <span
                        className={cn(
                          'w-1 shrink-0',
                          status === 'overdue' ? 'bg-error' : status === 'due_soon' ? 'bg-warning' : 'bg-brand-500',
                        )}
                        aria-hidden
                      />
                      <span className="flex flex-1 flex-wrap items-center justify-between gap-3 py-4 pl-4 pr-5">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-neutral-900 dark:text-neutral-50">{a.title}</span>
                          <span className="mt-0.5 block text-sm text-neutral-500 dark:text-neutral-400">
                            {subject ? `${subject} · ` : ''}
                            {a.batch_title} · Due {formatDue(a.due_at_utc)}
                          </span>
                          {batch?.tutor_display_name && (
                            <span className="mt-0.5 flex items-center gap-1 text-xs text-neutral-400 dark:text-neutral-500">
                              <User className="h-3 w-3" aria-hidden />
                              {batch.tutor_display_name}
                            </span>
                          )}
                        </span>
                        <StatusBadge status={status} />
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {settled.length > 0 && (
            <section>
              <SectionHeader title="Completed" />
              <AcademicCard className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
                {settled.map((a) => {
                  const { subject } = contextFor(a);
                  return (
                    <Link
                      key={a.id}
                      href={`/student/assignments/${a.id}`}
                      className="flex items-center justify-between gap-3 px-6 py-3.5 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <ClipboardList className="h-4 w-4 shrink-0 text-neutral-300 dark:text-neutral-600" aria-hidden />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">{a.title}</p>
                          <p className="text-xs text-neutral-400 dark:text-neutral-500">
                            {subject ? `${subject} · ` : ''}
                            {a.batch_title}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={statusFor(a)} />
                    </Link>
                  );
                })}
              </AcademicCard>
            </section>
          )}
        </>
      )}
    </div>
  );
}
