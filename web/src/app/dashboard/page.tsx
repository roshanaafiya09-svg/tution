'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Layers, CalendarCheck, CalendarDays, Video, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { Batch, Session } from '@/lib/types';
import { Card, PageHeader, EmptyState, StatusBadge, Button, PageLoading, buttonVariants } from '@/components/ui';

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

function isToday(session: Session): boolean {
  const start = new Date(session.scheduled_start_utc);
  const now = new Date();
  return start.toDateString() === now.toDateString();
}

const STATS = [
  { key: 'active', label: 'Active batches', icon: Layers },
  { key: 'today', label: 'Classes today', icon: CalendarCheck },
  { key: 'upcoming', label: 'Upcoming (14 days)', icon: CalendarDays },
] as const;

export default function TodayPage() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [batches, setBatches] = useState<Batch[] | null>(null);

  useEffect(() => {
    void api.get<Session[]>('/sessions/me').then(setSessions);
    void api.get<Batch[]>('/batches/me').then(setBatches);
  }, []);

  async function markComplete(sessionId: string) {
    await api.post(`/sessions/${sessionId}/complete`);
    setSessions(await api.get<Session[]>('/sessions/me'));
  }

  const loading = sessions === null || batches === null;
  const activeBatches = batches?.filter((b) => b.status === 'active') ?? [];
  const todaySessions = sessions?.filter(isToday) ?? [];
  const upcoming = sessions?.filter((s) => !isToday(s)) ?? [];

  const statValues: Record<(typeof STATS)[number]['key'], number> = {
    active: activeBatches.length,
    today: todaySessions.length,
    upcoming: sessions?.length ?? 0,
  };

  return (
    <div>
      <PageHeader
        title="Today"
        description="Your classes for the next two weeks."
        action={
          <Link href="/dashboard/batches">
            <Button>New batch</Button>
          </Link>
        }
      />

      {loading ? (
        <PageLoading />
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            {STATS.map((stat) => (
              <Card key={stat.key} className="flex items-start gap-3">
                <stat.icon className="mt-0.5 h-5 w-5 text-brand-500 dark:text-brand-300" aria-hidden />
                <div>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">{stat.label}</p>
                  <p className="mt-0.5 font-display text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
                    {statValues[stat.key]}
                  </p>
                </div>
              </Card>
            ))}
          </div>

          <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            Today&apos;s classes
          </h2>
          {todaySessions.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="No classes scheduled today"
              description="Schedule a session from any batch to see it here."
            />
          ) : (
            <div className="space-y-3">
              {todaySessions.map((session) => (
                <Card key={session.id} className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-neutral-50">
                      {session.batch_title}
                    </p>
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
                        Start class
                      </a>
                    )}
                    <Link href={`/dashboard/sessions/${session.id}`}>
                      <Button variant="secondary" size="sm">
                        Attendance
                      </Button>
                    </Link>
                    {session.status === 'scheduled' && (
                      <Button variant="secondary" size="sm" onClick={() => void markComplete(session.id)}>
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                        Mark done
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {upcoming.length > 0 && (
            <>
              <h2 className="mb-3 mt-8 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                Coming up
              </h2>
              <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
                {upcoming.map((session) => (
                  <div key={session.id} className="flex items-center justify-between px-6 py-3">
                    <div>
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                        {session.batch_title}
                      </p>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        {formatSessionTime(session)}
                      </p>
                    </div>
                    <StatusBadge status={session.status} />
                  </div>
                ))}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
