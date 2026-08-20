'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ListChecks, PenLine, Search, Send, Sparkles, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import type { QuizDraftSummary } from '@/lib/types';
import { buttonVariants, CardSkeleton, ErrorState, StatusBadge } from '@/components/ui';
import { TeacherPageHeader, AcademicCard, EmptyPanel, MetricCard } from '@/components/dashboard';

const PROCESS_STEPS = [
  { icon: Upload, label: 'Upload a PDF material' },
  { icon: Sparkles, label: 'Generate a draft' },
  { icon: Search, label: 'Review the questions' },
  { icon: PenLine, label: 'Edit if needed' },
  { icon: Send, label: 'Publish to the batch' },
] as const;

export default function QuizzesPage() {
  const [drafts, setDrafts] = useState<QuizDraftSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    api
      .get<QuizDraftSummary[]>('/quizzes/me')
      .then(setDrafts)
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pending = (drafts ?? []).filter((d) => d.status === 'pending_review');
  const approved = (drafts ?? []).filter((d) => d.status === 'approved');

  return (
    <div className="space-y-5">
      <TeacherPageHeader
        eyebrow="Teaching"
        title="Quizzes"
        description="AI-drafted quizzes from your own materials — you review and approve before anything reaches students."
        action={
          <Link href="/dashboard/materials" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Generate from material
          </Link>
        }
      />

      {loadError ? (
        <ErrorState description="Could not load your quiz drafts. Check your connection and try again." onRetry={load} />
      ) : drafts === null ? (
        <div className="space-y-4">
          <CardSkeleton className="h-24 rounded-2xl" />
          <CardSkeleton className="h-48 rounded-2xl" />
        </div>
      ) : drafts.length === 0 ? (
        <EmptyPanel
          icon={ListChecks}
          title="No quiz drafts yet"
          description="Upload a PDF to a batch and Scholar drafts multiple-choice questions from it. Nothing is published until you've read every question and approved it."
          steps={PROCESS_STEPS.map((step) => step.label)}
          action={
            <Link href="/dashboard/materials" className={buttonVariants({ size: 'sm' })}>
              Go to materials
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard icon={ListChecks} label="Drafts" value={drafts.length} hint="All time" />
            <MetricCard
              icon={PenLine}
              label="Awaiting review"
              value={pending.length}
              hint={pending.length === 0 ? 'Nothing waiting on you' : 'Review before publishing'}
              tone={pending.length > 0 ? 'warning' : 'success'}
            />
            <MetricCard icon={Send} label="Approved" value={approved.length} hint="Ready to publish to a batch" />
          </div>

          <AcademicCard className="p-0">
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {drafts.map((draft) => (
                <li key={draft.id}>
                  <Link
                    href={`/dashboard/quizzes/${draft.id}`}
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-neutral-50 sm:px-5 dark:hover:bg-neutral-800/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                        {draft.material_title}
                      </p>
                      <p className="text-xs text-neutral-400 dark:text-neutral-500">
                        Drafted {new Date(draft.created_at).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                    <StatusBadge status={draft.status} />
                    <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300 dark:text-neutral-600" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </AcademicCard>

          <p className="text-xs text-neutral-400 dark:text-neutral-500">
            AI-generated questions should always be checked by you — nothing reaches students until you approve a
            draft and publish it to a batch.
          </p>
        </>
      )}
    </div>
  );
}
