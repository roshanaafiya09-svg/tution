'use client';

import { useCallback, useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { api } from '@/lib/api';
import type { Announcement, Batch } from '@/lib/types';
import { EmptyState, CardSkeleton, ErrorState } from '@/components/ui';
import { PageIntro, SectionHeader, AcademicCard } from '@/components/student';

interface AnnouncementWithBatch extends Announcement {
  batch_title: string;
  tutor_display_name: string | null;
}

function recencyBucket(iso: string): 'Today' | 'This week' | 'Earlier' {
  const created = new Date(iso);
  const now = new Date();
  if (created.toLocaleDateString('en-CA') === now.toLocaleDateString('en-CA')) return 'Today';
  const daysAgo = (now.getTime() - created.getTime()) / (24 * 60 * 60 * 1000);
  return daysAgo <= 7 ? 'This week' : 'Earlier';
}

const BUCKET_ORDER = ['Today', 'This week', 'Earlier'] as const;

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

  const groups = BUCKET_ORDER.map((label) => ({
    label,
    items: (announcements ?? []).filter((a) => recencyBucket(a.created_at) === label),
  })).filter((g) => g.items.length > 0);

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
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.label}>
              <SectionHeader title={group.label} />
              <div className="space-y-3">
                {group.items.map((a) => (
                  <AcademicCard key={a.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="flex items-center gap-2 text-sm font-medium text-neutral-900 dark:text-neutral-50">
                        <Megaphone className="h-3.5 w-3.5 text-brand-500 dark:text-brand-300" aria-hidden />
                        {a.batch_title}
                        {a.tutor_display_name && (
                          <span className="font-normal text-neutral-400 dark:text-neutral-500">
                            · {a.tutor_display_name}
                          </span>
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
                    <p className="mt-3 font-display text-lg leading-snug text-neutral-800 dark:text-neutral-100">
                      {a.body}
                    </p>
                  </AcademicCard>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
