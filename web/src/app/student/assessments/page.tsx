'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';
import { api } from '@/lib/api';
import type { StudentOnlineAssessmentSummary } from '@/lib/types';
import { Card, CardSkeleton, EmptyState, ErrorState } from '@/components/ui';
import { PageIntro } from '@/components/student';

export default function StudentAssessmentsPage() {
  const [assessments, setAssessments] = useState<StudentOnlineAssessmentSummary[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoadError(null);
    setAssessments(null);
    api
      .get<StudentOnlineAssessmentSummary[]>('/assessments/online/student/me')
      .then(setAssessments)
      .catch((err: unknown) => setLoadError(err ?? true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Test yourself"
        title="Assessment"
        description="Online assessments published across your batches. Offline test results appear here once your tutor uploads the scorecard."
      />

      {/* The error must be checked before the loading state: on failure
          `assessments` stays null, so testing it first left the skeleton
          on screen forever and the error card unreachable. */}
      {loadError ? (
        <ErrorState error={loadError} what="your assessments" onRetry={load} />
      ) : assessments === null ? (
        <div className="space-y-3">
          <CardSkeleton className="rounded-2xl" />
          <CardSkeleton className="rounded-2xl" />
        </div>
      ) : assessments.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No assessments yet"
          description="Published assessments from your tutors will appear here."
        />
      ) : (
        <div className="space-y-3">
          {assessments.map((a) => (
            <AssessmentRow key={`${a.mode}-${a.id}`} assessment={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AssessmentRow({ assessment: a }: { assessment: StudentOnlineAssessmentSummary }) {
  const isOffline = a.mode === 'offline';
  const closedWithoutAttempt = !a.attempted && a.status !== 'published';
  const date = isOffline ? a.assessmentDate : a.publishedAt;

  const body = (
    <Card className={isOffline ? undefined : 'transition-colors hover:border-brand-300 dark:hover:border-brand-600'}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-neutral-900 dark:text-neutral-50">{a.title}</p>
          <p className="text-xs text-neutral-400 dark:text-neutral-500">
            {isOffline ? 'Offline test' : 'Online'}
            {date ? ` · ${new Date(date).toLocaleDateString('en-IN')}` : ''}
          </p>
        </div>
        {a.attempted ? (
          <span className="shrink-0 text-sm font-semibold text-neutral-900 dark:text-neutral-50">
            {a.score}/{a.maxScore}
          </span>
        ) : closedWithoutAttempt ? (
          <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            Closed
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            Take now
          </span>
        )}
      </div>
    </Card>
  );

  // Offline results are a score, not something to open — there is no
  // question paper for a student to take.
  return isOffline ? body : <Link href={`/student/assessments/${a.id}`}>{body}</Link>;
}
