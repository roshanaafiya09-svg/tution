'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ClipboardList, Megaphone, Video, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import type { Announcement, Batch, Me, Session, StudentAssignmentSummary } from '@/lib/types';
import { Card, PageHeader, EmptyState, PageLoading, StatusBadge, StatCard, buttonVariants } from '@/components/ui';

function formatSessionTime(session: Session): string {
  return new Date(session.scheduled_start_utc).toLocaleString('en-IN', {
    timeZone: session.timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface AnnouncementWithBatch extends Announcement {
  batch_title: string;
}

export default function StudentOverviewPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [assignments, setAssignments] = useState<StudentAssignmentSummary[] | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementWithBatch[] | null>(null);

  useEffect(() => {
    void api.get<Me>('/auth/me').then(setMe);
    void api.get<Session[]>('/sessions/upcoming').then(setSessions);
    void api.get<StudentAssignmentSummary[]>('/assignments/me').then(setAssignments);

    void api.get<Batch[]>('/batches/enrolled').then(async (batches) => {
      const perBatch = await Promise.all(
        batches.map((batch) =>
          api
            .get<Announcement[]>(`/announcements/batch/${batch.id}`)
            .then((list) => list.map((a) => ({ ...a, batch_title: batch.title })))
            .catch(() => []),
        ),
      );
      const merged = perBatch
        .flat()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5);
      setAnnouncements(merged);
    });
  }, []);

  const loading = sessions === null || assignments === null || announcements === null;
  const upcomingSessions = (sessions ?? []).slice(0, 3);
  const pendingAssignments = (assignments ?? []).filter((a) => !a.submission_id);

  return (
    <div>
      <PageHeader
        title={me ? `Welcome back` : 'Welcome'}
        description="Your classes, homework, and updates in one place."
      />

      {loading ? (
        <PageLoading />
      ) : (
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard icon={CalendarDays} label="Upcoming (14 days)" value={sessions?.length ?? 0} />
            <StatCard icon={ClipboardList} label="Pending assignments" value={pendingAssignments.length} />
            <StatCard icon={Megaphone} label="Recent announcements" value={announcements?.length ?? 0} />
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Upcoming classes</h2>
              <Link
                href="/student/schedule"
                className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
              >
                Full schedule
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
            {upcomingSessions.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="No classes scheduled"
                description="Your tutor hasn't scheduled any upcoming sessions yet."
              />
            ) : (
              <div className="space-y-3">
                {upcomingSessions.map((session) => (
                  <Card key={session.id} className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-neutral-900 dark:text-neutral-50">{session.batch_title}</p>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        {formatSessionTime(session)} · {session.duration_min} min
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={session.status} />
                      {session.meeting_url && (
                        <a
                          href={session.meeting_url}
                          target="_blank"
                          rel="noreferrer"
                          className={buttonVariants({ variant: 'accent', size: 'sm' })}
                        >
                          <Video className="h-3.5 w-3.5" aria-hidden />
                          Join class
                        </a>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Pending assignments</h2>
              <Link
                href="/student/assignments"
                className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
              >
                All assignments
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
            {pendingAssignments.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="Nothing pending"
                description="You're caught up on homework."
              />
            ) : (
              <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
                {pendingAssignments.slice(0, 5).map((a) => (
                  <Link
                    key={a.id}
                    href={`/student/assignments/${a.id}`}
                    className="flex items-center justify-between px-6 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                  >
                    <div>
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{a.title}</p>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">{a.batch_title}</p>
                    </div>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      Due {new Date(a.due_at_utc).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </p>
                  </Link>
                ))}
              </Card>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Recent announcements</h2>
              <Link
                href="/student/announcements"
                className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
              >
                All announcements
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
            {(announcements?.length ?? 0) === 0 ? (
              <EmptyState icon={Megaphone} title="No announcements yet" description="Nothing from your tutors so far." />
            ) : (
              <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
                {announcements!.map((a) => (
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
          </section>
        </div>
      )}
    </div>
  );
}
