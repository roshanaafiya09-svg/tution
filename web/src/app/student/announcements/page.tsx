'use client';

import { useCallback, useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { api } from '@/lib/api';
import type { Announcement, Batch } from '@/lib/types';
import { Card, PageHeader, EmptyState, CardSkeleton, ErrorState } from '@/components/ui';

interface AnnouncementWithBatch extends Announcement {
  batch_title: string;
  tutor_display_name: string | null;
}

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
    <div>
      <PageHeader title="Announcements" description="Updates from your tutors, across all your batches." />

      {announcements === null ? (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : loadError ? (
        <ErrorState description="Could not load your announcements. Check your connection and try again." onRetry={load} />
      ) : announcements.length === 0 ? (
        <EmptyState icon={Megaphone} title="No announcements yet" description="Updates from your tutors will appear here." />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
          {announcements.map((a) => (
            <div key={a.id} className="flex items-start gap-3 px-6 py-4">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                <Megaphone className="h-4 w-4" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    {a.batch_title}
                    {a.tutor_display_name && (
                      <span className="font-normal text-neutral-500 dark:text-neutral-400"> · {a.tutor_display_name}</span>
                    )}
                  </p>
                  <p className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">
                    {new Date(a.created_at).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{a.body}</p>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
