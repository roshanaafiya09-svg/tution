'use client';

import { useCallback, useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { api } from '@/lib/api';
import type { Announcement, Batch } from '@/lib/types';
import { EmptyState, CardSkeleton, ErrorState } from '@/components/ui';
import { PageIntro, AnnouncementsList, type AnnouncementWithBatch } from '@/components/student';

export default function StudentAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<AnnouncementWithBatch[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    setAnnouncements(null);
    api
      .get<Batch[]>('/batches/enrolled')
      .then(async (batches) => {
        const perBatch = await Promise.all(
          batches.map((batch) =>
            api
              .get<Announcement[]>(`/announcements/batch/${batch.id}`)
              .then((list) =>
                list.map((a) => ({
                  ...a,
                  batch_title: batch.title,
                  tutor_display_name: batch.tutor_display_name ?? null,
                })),
              )
              .catch(() => [] as AnnouncementWithBatch[]),
          ),
        );
        setAnnouncements(
          perBatch.flat().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        );
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-8">
      <PageIntro eyebrow="Recent updates" title="Announcements" description="Updates from your tutors, across all your batches." />

      {announcements === null ? (
        <div className="space-y-4">
          <CardSkeleton className="rounded-2xl" />
          <CardSkeleton className="rounded-2xl" />
        </div>
      ) : loadError ? (
        <ErrorState description="Could not load your announcements. Check your connection and try again." onRetry={load} />
      ) : announcements.length === 0 ? (
        <EmptyState icon={Megaphone} title="No announcements yet" description="Updates from your tutors will appear here." />
      ) : (
        <AnnouncementsList announcements={announcements} />
      )}
    </div>
  );
}
