'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ListChecks, Upload, Sparkles, Search, PenLine, Send } from 'lucide-react';
import { api } from '@/lib/api';
import type { QuizDraftSummary } from '@/lib/types';
import { Card, PageHeader, EmptyState, StatusBadge, CardSkeleton, ErrorState } from '@/components/ui';

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
    api.get<QuizDraftSummary[]>('/quizzes/me').then(setDrafts).catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Quizzes"
        description="AI-drafted quizzes from your materials — review and approve before publishing to a batch."
      />

      <Card className="mb-6">
        <p className="mb-4 text-sm font-semibold text-neutral-700 dark:text-neutral-200">How it works</p>
        <ol className="grid gap-4 sm:grid-cols-5">
          {PROCESS_STEPS.map((step, i) => (
            <li key={step.label} className="flex flex-col items-start gap-2 text-sm">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
                {i + 1}
              </span>
              <span className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300">
                <step.icon className="h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden />
                {step.label}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-neutral-400 dark:text-neutral-500">
          AI-generated content should always be reviewed by you before publishing — nothing reaches students until
          you approve it.
        </p>
      </Card>

      {loadError ? (
        <ErrorState description="Could not load your quiz drafts. Check your connection and try again." onRetry={load} />
      ) : drafts === null ? (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : drafts.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No quiz drafts yet"
          description="Generate one from a PDF material in a batch's Materials tab."
        />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
          {drafts.map((draft) => (
            <Link
              key={draft.id}
              href={`/dashboard/quizzes/${draft.id}`}
              className="flex items-center justify-between px-6 py-3 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
            >
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                  {draft.material_title}
                </p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {new Date(draft.created_at).toLocaleDateString('en-IN')}
                </p>
              </div>
              <StatusBadge status={draft.status} />
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
