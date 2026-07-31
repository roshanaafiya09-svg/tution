'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Batch, Session } from '@/lib/types';
import { Card, PageHeader, EmptyState, StatusBadge, Button } from '@/components/ui';

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

  const activeBatches = batches?.filter((b) => b.status === 'active') ?? [];
  const todaySessions = sessions?.filter(isToday) ?? [];
  const upcoming = sessions?.filter((s) => !isToday(s)) ?? [];

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

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-neutral-500">Active batches</p>
          <p className="mt-1 font-display text-3xl font-semibold text-neutral-900">
            {activeBatches.length}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-neutral-500">Classes today</p>
          <p className="mt-1 font-display text-3xl font-semibold text-neutral-900">
            {todaySessions.length}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-neutral-500">Upcoming (14 days)</p>
          <p className="mt-1 font-display text-3xl font-semibold text-neutral-900">
            {sessions?.length ?? 0}
          </p>
        </Card>
      </div>

      <h2 className="mb-3 text-lg font-semibold text-neutral-900">Today&apos;s classes</h2>
      {todaySessions.length === 0 ? (
        <EmptyState
          title="No classes scheduled today"
          description="Schedule a session from any batch to see it here."
        />
      ) : (
        <div className="space-y-3">
          {todaySessions.map((session) => (
            <Card key={session.id} className="flex items-center justify-between">
              <div>
                <p className="font-medium text-neutral-900">{session.batch_title}</p>
                <p className="text-sm text-neutral-500">
                  {formatSessionTime(session)} · {session.duration_min} min
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={session.status} />
                {session.meeting_url && (
                  <a
                    href={session.meeting_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-accent-400"
                  >
                    Start class
                  </a>
                )}
                <Link href={`/dashboard/sessions/${session.id}`}>
                  <Button variant="secondary">Attendance</Button>
                </Link>
                {session.status === 'scheduled' && (
                  <Button variant="secondary" onClick={() => void markComplete(session.id)}>
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
          <h2 className="mb-3 mt-8 text-lg font-semibold text-neutral-900">Coming up</h2>
          <Card className="divide-y divide-neutral-100 p-0">
            {upcoming.map((session) => (
              <div key={session.id} className="flex items-center justify-between px-6 py-3">
                <div>
                  <p className="text-sm font-medium text-neutral-900">{session.batch_title}</p>
                  <p className="text-sm text-neutral-500">{formatSessionTime(session)}</p>
                </div>
                <StatusBadge status={session.status} />
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
