import Link from 'next/link';
import { ClipboardList, User } from 'lucide-react';
import type { Batch, StudentAssignmentSummary, Subject } from '@/lib/types';
import { StatusBadge } from '@/components/ui';
import { AcademicCard, SectionHeader } from '@/components/student';
import { cn } from '@/lib/cn';

export type AssignmentStatus = 'overdue' | 'due_today' | 'due_soon' | 'upcoming' | 'submitted' | 'graded';

const DUE_SOON_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export function statusFor(a: StudentAssignmentSummary): AssignmentStatus {
  if (a.grade !== null) return 'graded';
  if (a.submission_id) return 'submitted';
  const due = new Date(a.due_at_utc);
  const now = new Date();
  const dueIn = due.getTime() - now.getTime();
  if (dueIn < 0) return 'overdue';
  if (due.toLocaleDateString('en-CA') === now.toLocaleDateString('en-CA')) return 'due_today';
  if (dueIn <= DUE_SOON_WINDOW_MS) return 'due_soon';
  return 'upcoming';
}

function formatDue(dueAtUtc: string): string {
  return new Date(dueAtUtc).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const ATTENTION_BAR_TONE: Record<'overdue' | 'due_today' | 'due_soon', string> = {
  overdue: 'bg-error',
  due_today: 'bg-warning',
  due_soon: 'bg-brand-500',
};

const ATTENTION_GROUPS: { status: 'due_today' | 'due_soon' | 'overdue'; label: string }[] = [
  { status: 'due_today', label: 'Due today' },
  { status: 'due_soon', label: 'Due soon' },
  { status: 'overdue', label: 'Overdue' },
];

function AssignmentRow({
  assignment,
  status,
  subject,
  batch,
}: {
  assignment: StudentAssignmentSummary;
  status: 'overdue' | 'due_today' | 'due_soon';
  subject?: string;
  batch?: Batch;
}) {
  return (
    <Link
      href={`/student/assignments/${assignment.id}`}
      className="group flex items-stretch gap-0 overflow-hidden rounded-xl border border-neutral-200/70 bg-white transition-all duration-base hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-sm dark:border-neutral-800/80 dark:bg-surface dark:hover:border-neutral-700"
    >
      <span className={cn('w-1 shrink-0', ATTENTION_BAR_TONE[status])} aria-hidden />
      <span className="flex flex-1 flex-wrap items-center justify-between gap-3 py-4 pl-4 pr-5">
        <span className="min-w-0">
          <span className="block truncate font-medium text-neutral-900 dark:text-neutral-50">{assignment.title}</span>
          <span className="mt-0.5 block text-sm text-neutral-500 dark:text-neutral-400">
            {subject ? `${subject} · ` : ''}
            {assignment.batch_title} · Due {formatDue(assignment.due_at_utc)}
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
}

/** Needs Attention (Due today / Due soon / Overdue) → Upcoming → Completed
 *  — shared by the global Assignments page (all batches) and each batch
 *  workspace's Assignments tab (one batch's assignments already
 *  pre-filtered by the caller). Loading/error/empty states stay with the
 *  caller. */
export function AssignmentsList({
  assignments,
  batches,
  subjects,
}: {
  assignments: StudentAssignmentSummary[];
  batches: Batch[];
  subjects: Subject[];
}) {
  function contextFor(a: StudentAssignmentSummary) {
    const batch = batches.find((b) => b.id === a.batch_id);
    const subject = batch ? subjects.find((s) => s.id === batch.subject_id)?.name_i18n.en : undefined;
    return { batch, subject };
  }

  const sorted = assignments.slice().sort((a, b) => new Date(a.due_at_utc).getTime() - new Date(b.due_at_utc).getTime());
  const byStatus = new Map<AssignmentStatus, StudentAssignmentSummary[]>();
  for (const a of sorted) {
    const status = statusFor(a);
    const bucket = byStatus.get(status) ?? [];
    bucket.push(a);
    byStatus.set(status, bucket);
  }

  const overdueCount = byStatus.get('overdue')?.length ?? 0;
  const pendingCount = sorted.length - (byStatus.get('submitted')?.length ?? 0) - (byStatus.get('graded')?.length ?? 0);
  const completedCount = (byStatus.get('submitted')?.length ?? 0) + (byStatus.get('graded')?.length ?? 0);
  const upcoming = byStatus.get('upcoming') ?? [];
  const settled = [...(byStatus.get('submitted') ?? []), ...(byStatus.get('graded') ?? [])];

  return (
    <>
      <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
        {pendingCount} Pending · {completedCount} Completed · {overdueCount} Overdue
      </p>

      {ATTENTION_GROUPS.some((g) => (byStatus.get(g.status)?.length ?? 0) > 0) && (
        <section>
          <SectionHeader
            eyebrow={`${pendingCount} need${pendingCount === 1 ? 's' : ''} action`}
            title="Needs your attention"
          />
          <div className="space-y-5">
            {ATTENTION_GROUPS.map((group) => {
              const items = byStatus.get(group.status) ?? [];
              if (items.length === 0) return null;
              return (
                <div key={group.status}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-500">
                    {group.label}
                  </p>
                  <div className="space-y-2">
                    {items.map((a) => {
                      const { batch, subject } = contextFor(a);
                      return (
                        <AssignmentRow key={a.id} assignment={a} status={group.status} subject={subject} batch={batch} />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section>
          <SectionHeader title="Upcoming" />
          <AcademicCard className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
            {upcoming.map((a) => {
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
                        {a.batch_title} · Due {formatDue(a.due_at_utc)}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </AcademicCard>
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
  );
}
