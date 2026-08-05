'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ListChecks } from 'lucide-react';
import { api } from '@/lib/api';
import type { QuizDraftSummary } from '@/lib/types';
import { Card, PageHeader, EmptyState, StatusBadge, PageLoading } from '@/components/ui';

export default function QuizzesPage() {
  const [drafts, setDrafts] = useState<QuizDraftSummary[] | null>(null);

  useEffect(() => {
    void api.get<QuizDraftSummary[]>('/quizzes/me').then(setDrafts);
  }, []);

  return (
    <div>
      <PageHeader
        title="Quizzes"
        description="AI-drafted quizzes from your materials — review and approve before publishing to a batch."
      />

      {drafts === null ? (
        <PageLoading />
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
