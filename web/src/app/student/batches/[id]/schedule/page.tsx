'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { api } from '@/lib/api';
import type { Session } from '@/lib/types';
import { EmptyState, CardSkeleton, ErrorState } from '@/components/ui';
import { ScheduleList, useBatchWorkspace } from '@/components/student';

export default function BatchScheduleTab() {
  const { batch, subjects } = useBatchWorkspace();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    setSessions(null);
    api
      .get<Session[]>('/sessions/upcoming')
      .then((all) => setSessions(all.filter((s) => s.batch_id === batch.id)))
      .catch(() => setLoadError(true));
  }, [batch.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (sessions === null) {
    return (
      <div className="space-y-3">
        <CardSkeleton className="rounded-2xl" />
        <CardSkeleton className="rounded-2xl" />
      </div>
    );
  }
  if (loadError) {
    return <ErrorState description="Could not load this batch's schedule. Check your connection and try again." onRetry={load} />;
  }
  if (sessions.length === 0) {
    return <EmptyState icon={CalendarDays} title="No upcoming classes" description="Your tutor hasn't scheduled a class yet." />;
  }

  return <ScheduleList sessions={sessions} batches={[batch]} subjects={subjects} />;
}
