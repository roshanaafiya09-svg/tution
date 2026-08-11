'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ListChecks, ChevronRight } from 'lucide-react';
import { api, apiGetPublic } from '@/lib/api';
import type { Batch, StudentQuizSummary, Subject } from '@/lib/types';
import { EmptyState, CardSkeleton, ErrorState, buttonVariants } from '@/components/ui';
import { PageIntro, AcademicCard, ProgressRing } from '@/components/student';
import { cn } from '@/lib/cn';

export default function StudentQuizzesPage() {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [quizzes, setQuizzes] = useState<StudentQuizSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [quizzesError, setQuizzesError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    setBatches(null);
    setSubjects(null);
    Promise.all([api.get<Batch[]>('/batches/enrolled'), apiGetPublic<Subject[]>('/catalog/subjects')])
      .then(([list, subs]) => {
        setBatches(list);
        setSubjects(subs);
        if (list.length > 0) setBatchId((current) => current ?? list[0].id);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadQuizzes = useCallback(() => {
    if (!batchId) return;
    setQuizzesError(false);
    setQuizzes(null);
    api
      .get<StudentQuizSummary[]>(`/quizzes/batch/${batchId}`)
      .then(setQuizzes)
      .catch(() => setQuizzesError(true));
  }, [batchId]);

  useEffect(() => {
    loadQuizzes();
  }, [loadQuizzes]);

  const loading = batches === null || subjects === null;
  const batch = batches?.find((b) => b.id === batchId);
  const subjectName = batch ? subjects?.find((s) => s.id === batch.subject_id)?.name_i18n.en : undefined;

  return (
    <div className="space-y-8">
      <PageIntro eyebrow="Test yourself" title="Quizzes" description="Published quizzes from your tutors." />

      {loading ? (
        <div className="space-y-3">
          <CardSkeleton className="rounded-2xl" />
          <CardSkeleton className="rounded-2xl" />
        </div>
      ) : loadError ? (
        <ErrorState description="Could not load your batches. Check your connection and try again." onRetry={load} />
      ) : batches.length === 0 ? (
        <EmptyState icon={ListChecks} title="No batches yet" description="Join a batch to see quizzes here." />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {batches.map((b) => (
              <button
                key={b.id}
                onClick={() => setBatchId(b.id)}
                className={cn(
                  'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                  batchId === b.id
                    ? 'border-brand-600 bg-brand-600 text-white shadow-sm dark:border-brand-400 dark:bg-brand-500'
                    : 'border-neutral-300 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800',
                )}
              >
                {b.title}
              </button>
            ))}
          </div>

          {quizzes === null ? (
            <CardSkeleton className="rounded-2xl" />
          ) : quizzesError ? (
            <ErrorState description="Could not load quizzes for this batch." onRetry={loadQuizzes} />
          ) : quizzes.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="No quizzes available"
              description="Published quizzes will appear here when your tutor shares them."
            />
          ) : (
            <div className="space-y-3">
              {quizzes.map((q) => (
                <Link key={q.id} href={`/student/quizzes/${q.id}`}>
                  <AcademicCard interactive className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                        {q.title}
                      </p>
                      <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                        {subjectName ? `${subjectName} · ` : ''}
                        {q.questionCount} question{q.questionCount === 1 ? '' : 's'}
                      </p>
                    </div>
                    {q.attempted ? (
                      <div className="flex shrink-0 items-center gap-3">
                        <ProgressRing
                          value={q.total ? Math.round(((q.score ?? 0) / q.total) * 100) : 0}
                          size={52}
                          strokeWidth={5}
                          tone="success"
                        >
                          <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
                            {q.score}/{q.total}
                          </span>
                        </ProgressRing>
                        <span className="hidden text-sm font-medium text-neutral-500 dark:text-neutral-400 sm:inline">
                          Review
                        </span>
                        <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden />
                      </div>
                    ) : (
                      <span className={cn(buttonVariants({ variant: 'accent', size: 'sm' }), 'pointer-events-none shrink-0')}>
                        Start quiz
                      </span>
                    )}
                  </AcademicCard>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
