'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Layers,
  CalendarCheck,
  CalendarDays,
  Video,
  CheckCircle2,
  BookMarked,
  CalendarClock,
  ClipboardCheck,
  Wallet,
  Users,
  Activity,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { Batch, Session, Subject, AppNotification } from '@/lib/types';
import {
  Card,
  PageHeader,
  EmptyState,
  StatusBadge,
  Button,
  CardSkeleton,
  ErrorState,
  StatCard,
  buttonVariants,
  useToast,
} from '@/components/ui';
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist';

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

function formatActivityTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
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
  const toast = useToast();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    setSessions(null);
    setBatches(null);
    setSubjects(null);
    setNotifications(null);
    Promise.all([
      api.get<Session[]>('/sessions/me'),
      api.get<Batch[]>('/batches/me'),
      api.get<Subject[]>('/catalog/subjects'),
      api.get<AppNotification[]>('/notifications'),
    ])
      .then(([s, b, subs, notifs]) => {
        setSessions(s);
        setBatches(b);
        setSubjects(subs);
        setNotifications(notifs);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markComplete(sessionId: string) {
    try {
      await api.post(`/sessions/${sessionId}/complete`);
      setSessions(await api.get<Session[]>('/sessions/me'));
      toast({ title: 'Marked as done', variant: 'success' });
    } catch {
      toast({ title: 'Could not update the class', variant: 'error' });
    }
  }

  const loading = sessions === null || batches === null || subjects === null || notifications === null;
  const activeBatches = batches?.filter((b) => b.status === 'active') ?? [];
  const todaySessions = sessions?.filter(isToday) ?? [];
  const upcoming = sessions?.filter((s) => !isToday(s)) ?? [];

  const now = new Date();
  const nextSession =
    sessions
      ?.filter((s) => s.status === 'scheduled' && new Date(s.scheduled_start_utc) >= now)
      .sort((a, b) => new Date(a.scheduled_start_utc).getTime() - new Date(b.scheduled_start_utc).getTime())[0] ??
    null;
  const nextSessionBatch = nextSession ? batches?.find((b) => b.id === nextSession.batch_id) : undefined;
  const nextSessionSubject = nextSessionBatch
    ? subjects?.find((s) => s.id === nextSessionBatch.subject_id)?.name_i18n.en
    : undefined;

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
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : loadError ? (
        <ErrorState
          description="Could not load your dashboard. Check your connection and try again."
          onRetry={load}
        />
      ) : (
        <>
          <OnboardingChecklist batches={batches ?? []} />

          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            {STATS.map((stat) => (
              <StatCard key={stat.key} icon={stat.icon} label={stat.label} value={statValues[stat.key]} />
            ))}
          </div>

          {nextSession && (
            <div className="mb-8">
              <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">Next class</h2>
              <Card className="border-brand-200 bg-brand-50/40 dark:border-brand-500/25 dark:bg-brand-500/5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-display text-xl font-semibold text-neutral-900 dark:text-neutral-50">
                      {nextSession.batch_title}
                    </p>
                    <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                      {nextSessionSubject ? `${nextSessionSubject} · ` : ''}
                      {formatSessionTime(nextSession)} · {nextSession.duration_min} min
                    </p>
                    {nextSessionBatch && (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
                        <Users className="h-3.5 w-3.5" aria-hidden />
                        Up to {nextSessionBatch.capacity} students
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {nextSession.meeting_url && (
                      <a
                        href={nextSession.meeting_url}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonVariants({ variant: 'accent', size: 'sm' })}
                      >
                        <Video className="h-3.5 w-3.5" aria-hidden />
                        Join class
                      </a>
                    )}
                    <Link href={`/dashboard/sessions/${nextSession.id}`}>
                      <Button variant="secondary" size="sm">
                        Mark attendance
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            </div>
          )}

          <div className="mb-8">
            <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">Quick actions</h2>
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard/batches" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                <Layers className="h-3.5 w-3.5" aria-hidden />
                Create batch
              </Link>
              <Link href="/dashboard/subjects" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                <BookMarked className="h-3.5 w-3.5" aria-hidden />
                Add subject
              </Link>
              <Link href="/dashboard/availability" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                Add availability
              </Link>
              {nextSession && (
                <Link
                  href={`/dashboard/sessions/${nextSession.id}`}
                  className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                >
                  <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
                  Record attendance
                </Link>
              )}
              <Link href="/dashboard/fees" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                <Wallet className="h-3.5 w-3.5" aria-hidden />
                Generate fees
              </Link>
            </div>
          </div>

          <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            Today&apos;s classes
          </h2>
          {todaySessions.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="No classes scheduled today"
              description="Create a batch or schedule your first session to get started."
              action={
                activeBatches.length > 0 ? (
                  <Link href="/dashboard/batches">
                    <Button variant="secondary" size="sm">
                      Go to batches
                    </Button>
                  </Link>
                ) : (
                  <Link href="/dashboard/batches">
                    <Button size="sm">Create a batch</Button>
                  </Link>
                )
              }
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

          <h2 className="mb-3 mt-8 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            Recent activity
          </h2>
          {notifications && notifications.length > 0 ? (
            <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
              {notifications.slice(0, 5).map((n) => (
                <div key={n.id} className="px-6 py-3">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{n.payload.title}</p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">{n.payload.body}</p>
                  <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                    {formatActivityTime(n.created_at)}
                  </p>
                </div>
              ))}
            </Card>
          ) : (
            <p className="flex items-center gap-2 text-sm text-neutral-400 dark:text-neutral-500">
              <Activity className="h-3.5 w-3.5" aria-hidden />
              No recent activity yet — it will show up here as students message you or join a batch.
            </p>
          )}
        </>
      )}
    </div>
  );
}
