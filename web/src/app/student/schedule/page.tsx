'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, Video } from 'lucide-react';
import { api } from '@/lib/api';
import type { Session } from '@/lib/types';
import { Card, PageHeader, EmptyState, PageLoading, StatusBadge, buttonVariants } from '@/components/ui';

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

export default function StudentSchedulePage() {
  const [sessions, setSessions] = useState<Session[] | null>(null);

  useEffect(() => {
    void api.get<Session[]>('/sessions/upcoming').then(setSessions);
  }, []);

  return (
    <div>
      <PageHeader title="Schedule" description="Your classes for the next two weeks." />

      {sessions === null ? (
        <PageLoading />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No classes scheduled"
          description="Nothing on your schedule for the next two weeks."
        />
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
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
    </div>
  );
}
