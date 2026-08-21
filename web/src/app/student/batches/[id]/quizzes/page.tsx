'use client';

import { useCallback, useEffect, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { api } from '@/lib/api';
import type { StudentQuizSummary } from '@/lib/types';
import { EmptyState, CardSkeleton, ErrorState } from '@/components/ui';
import { QuizzesList, useBatchWorkspace } from '@/components/student';

export default function BatchQuizzesTab() {
  const { batch, subjectName } = useBatchWorkspace();
  const [quizzes, setQuizzes] = useState<StudentQuizSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    setQuizzes(null);
    api
      .get<StudentQuizSummary[]>(`/quizzes/batch/${batch.id}`)
      .then(setQuizzes)
      .catch(() => setLoadError(true));
  }, [batch.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (quizzes === null) {
    return (
      <div className="space-y-3">
        <CardSkeleton className="rounded-2xl" />
        <CardSkeleton className="rounded-2xl" />
      </div>
    );
  }
  if (loadError) {
    return <ErrorState description="Could not load this batch's quizzes." onRetry={load} />;
  }
  if (quizzes.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="No quizzes available"
        description="Published quizzes will appear here when your tutor shares them."
      />
    );
  }

  return <QuizzesList quizzes={quizzes} subjectName={subjectName} />;
}
