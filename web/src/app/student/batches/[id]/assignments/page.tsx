'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { StudentAssignmentSummary } from '@/lib/types';
import { EmptyState, CardSkeleton, ErrorState } from '@/components/ui';
import { AssignmentsList, useBatchWorkspace } from '@/components/student';

export default function BatchAssignmentsTab() {
  const { batch, subjects } = useBatchWorkspace();
  const [assignments, setAssignments] = useState<StudentAssignmentSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    setAssignments(null);
    api
      .get<StudentAssignmentSummary[]>('/assignments/me')
      .then((all) => setAssignments(all.filter((a) => a.batch_id === batch.id)))
      .catch(() => setLoadError(true));
  }, [batch.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (assignments === null) {
    return (
      <div className="space-y-3">
        <CardSkeleton className="rounded-2xl" />
        <CardSkeleton className="rounded-2xl" />
      </div>
    );
  }
  if (loadError) {
    return <ErrorState description="Could not load this batch's assignments. Check your connection and try again." onRetry={load} />;
  }
  if (assignments.length === 0) {
    return <EmptyState icon={CheckCircle2} title="You're all caught up 🎉" description="New assignments from your tutor will appear here." />;
  }

  return <AssignmentsList assignments={assignments} batches={[batch]} subjects={subjects} />;
}
