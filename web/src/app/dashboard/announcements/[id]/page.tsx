'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { AcademyAnnouncementForRecipient } from '@/lib/types';
import { Card, CardSkeleton, ErrorState, PageHeader } from '@/components/ui';

/** Permalink reached only via a notification click-through (type
 *  'academy_announcement', see teacherNotificationHref) — no rail entry
 *  of its own, same shape as the other SECONDARY_ROUTES in teacher-nav.ts. */
export default function TeacherAnnouncementDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [announcement, setAnnouncement] = useState<AcademyAnnouncementForRecipient | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<AcademyAnnouncementForRecipient>(`/announcements/${params.id}`)
      .then((a) => {
        if (!cancelled) setAnnouncement(a);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (notFound) {
    return (
      <ErrorState
        title="Announcement not found"
        description="It may have been removed, or wasn't sent to you."
        onRetry={() => router.push('/dashboard')}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        description="Could not load this announcement. Check your connection and try again."
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Announcement"
        title={announcement?.title ?? 'Announcement'}
        back={{ href: '/dashboard', label: 'Today' }}
      />

      {announcement === null ? (
        <CardSkeleton className="h-40 rounded-2xl" />
      ) : (
        <Card>
          <p className="text-xs text-neutral-400 dark:text-neutral-500">
            {announcement.academyName ?? 'Your academy'}
            {announcement.publishedAt && ` · ${new Date(announcement.publishedAt).toLocaleString('en-IN')}`}
          </p>
          <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-300">{announcement.body}</p>
        </Card>
      )}
    </div>
  );
}
