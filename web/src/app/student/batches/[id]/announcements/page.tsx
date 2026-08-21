'use client';

import { useCallback, useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { api } from '@/lib/api';
import type { Announcement } from '@/lib/types';
import { EmptyState, CardSkeleton, ErrorState } from '@/components/ui';
import { AnnouncementsList, useBatchWorkspace, type AnnouncementWithBatch } from '@/components/student';

export default function BatchAnnouncementsTab() {
  const { batch } = useBatchWorkspace();
  const [announcements, setAnnouncements] = useState<AnnouncementWithBatch[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    setAnnouncements(null);
    api
      .get<Announcement[]>(`/announcements/batch/${batch.id}`)
      .then((list) =>
        setAnnouncements(
          list
            .map((a) => ({ ...a, batch_title: batch.title, tutor_display_name: batch.tutor_display_name ?? null }))
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        ),
      )
      .catch(() => setLoadError(true));
  }, [batch.id, batch.title, batch.tutor_display_name]);

  useEffect(() => {
    load();
  }, [load]);

  if (announcements === null) {
    return (
      <div className="space-y-4">
        <CardSkeleton className="rounded-2xl" />
        <CardSkeleton className="rounded-2xl" />
      </div>
    );
  }
  if (loadError) {
    return <ErrorState description="Could not load this batch's announcements. Check your connection and try again." onRetry={load} />;
  }
  if (announcements.length === 0) {
    return <EmptyState icon={Megaphone} title="No announcements yet" description="Updates from your tutor will appear here." />;
  }

  return <AnnouncementsList announcements={announcements} />;
}
