'use client';

import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { api } from '@/lib/api';
import type { Announcement, Batch } from '@/lib/types';
import { Card, PageHeader, EmptyState, PageLoading } from '@/components/ui';

interface AnnouncementWithBatch extends Announcement {
  batch_title: string;
}

export default function StudentAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<AnnouncementWithBatch[] | null>(null);

  useEffect(() => {
    void api.get<Batch[]>('/batches/enrolled').then(async (batches) => {
      const perBatch = await Promise.all(
        batches.map((batch) =>
          api
            .get<Announcement[]>(`/announcements/batch/${batch.id}`)
            .then((list) => list.map((a) => ({ ...a, batch_title: batch.title })))
            .catch(() => []),
        ),
      );
      setAnnouncements(
        perBatch.flat().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      );
    });
  }, []);

  return (
    <div>
      <PageHeader title="Announcements" description="Updates from your tutors, across all your batches." />

      {announcements === null ? (
        <PageLoading />
      ) : announcements.length === 0 ? (
        <EmptyState icon={Megaphone} title="No announcements yet" description="Nothing from your tutors so far." />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
          {announcements.map((a) => (
            <div key={a.id} className="px-6 py-3">
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{a.batch_title}</p>
              <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">{a.body}</p>
              <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                {new Date(a.created_at).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
