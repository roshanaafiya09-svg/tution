'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ListChecks } from 'lucide-react';
import { api } from '@/lib/api';
import type { Batch, StudentQuizSummary } from '@/lib/types';
import { Card, PageHeader, EmptyState, PageLoading, Badge } from '@/components/ui';

export default function StudentQuizzesPage() {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [quizzes, setQuizzes] = useState<StudentQuizSummary[] | null>(null);

  useEffect(() => {
    void api.get<Batch[]>('/batches/enrolled').then((list) => {
      setBatches(list);
      if (list.length > 0) setBatchId(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!batchId) return;
    setQuizzes(null);
    void api.get<StudentQuizSummary[]>(`/quizzes/batch/${batchId}`).then(setQuizzes);
  }, [batchId]);

  return (
    <div>
      <PageHeader title="Quizzes" description="Published quizzes from your tutors." />

      {batches === null ? (
        <PageLoading />
      ) : batches.length === 0 ? (
        <EmptyState icon={ListChecks} title="No batches yet" description="Join a batch to see quizzes here." />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {batches.map((b) => (
              <button
                key={b.id}
                onClick={() => setBatchId(b.id)}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                  batchId === b.id
                    ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/15 dark:text-brand-200'
                    : 'border-neutral-300 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800'
                }`}
              >
                {b.title}
              </button>
            ))}
          </div>

          {quizzes === null ? (
            <PageLoading />
          ) : quizzes.length === 0 ? (
            <EmptyState icon={ListChecks} title="No quizzes yet" description="Nothing published for this batch yet." />
          ) : (
            <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
              {quizzes.map((q) => (
                <Link
                  key={q.id}
                  href={`/student/quizzes/${q.id}`}
                  className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-neutral-50">{q.title}</p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">{q.questionCount} questions</p>
                  </div>
                  {q.attempted ? (
                    <Badge variant="brand">
                      {q.score}/{q.total}
                    </Badge>
                  ) : (
                    <Badge>Not attempted</Badge>
                  )}
                </Link>
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
