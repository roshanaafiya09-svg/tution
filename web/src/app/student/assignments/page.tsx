'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { api, apiGetPublic } from '@/lib/api';
import type { Batch, StudentAssignmentSummary, Subject } from '@/lib/types';
import { EmptyState, CardSkeleton, ErrorState } from '@/components/ui';
import { PageIntro, AssignmentsList } from '@/components/student';

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
      ) : assignments.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="You're all caught up 🎉"
          description="New assignments from your tutors will appear here."
        />
      ) : (
        <AssignmentsList assignments={assignments} batches={batches} subjects={subjects} />
      )}
    </div>
  );
}
