'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Layers,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  BookMarked,
  CalendarClock,
  Wallet,
  MessageSquareText,
  CheckCircle2,
  Megaphone,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { Batch, Session, Subject, AppNotification } from '@/lib/types';
import { EmptyState, CardSkeleton, ErrorState, Button, buttonVariants, useToast } from '@/components/ui';
import {
  TeacherHero,
  SectionHeader,
  StatBand,
  StatBandItem,
  ActionCard,
  SessionCard,
  ActivityFeed,
  type DayPeriod,
  type ActivityItem,
} from '@/components/dashboard';
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

function isToday(session: Session): boolean {
  const start = new Date(session.scheduled_start_utc);
  const now = new Date();
  return start.toDateString() === now.toDateString();
}

function dayPeriod(): DayPeriod {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

const GREETING: Record<DayPeriod, string> = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
};

const NOTIFICATION_ICON: Record<string, { icon: LucideIcon; tone: ActivityItem['tone'] }> = {
  new_message: { icon: MessageSquareText, tone: 'info' },
};

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

  // Needs attention — classes that already started but are still
  // 'scheduled' (attendance never marked), plus unread notifications.
  // Assembled only from real data already on this page; nothing invented.
  const overdueSessions = (sessions ?? []).filter(
    (s) => s.status === 'scheduled' && new Date(s.scheduled_start_utc) < now,
  );
  const unreadNotifications = (notifications ?? []).filter((n) => !n.read_at);

  const period = dayPeriod();

  return (
    <div className="space-y-8">
      {loading ? (
        <div className="space-y-8">
          <CardSkeleton className="h-56 rounded-3xl" />
          <div className="grid gap-4 sm:grid-cols-3">
            <CardSkeleton className="rounded-2xl" />
            <CardSkeleton className="rounded-2xl" />
            <CardSkeleton className="rounded-2xl" />
          </div>
          <CardSkeleton className="rounded-2xl" />
        </div>
      ) : loadError ? (
        <ErrorState
          description="Could not load your dashboard. Check your connection and try again."
          onRetry={load}
        />
      ) : (
        <>
          <div className="animate-fade-up" style={{ animationDelay: '0ms' }}>
            <TeacherHero
              period={period}
              greeting={`${GREETING[period]} 👋`}
              subtitle="Here's what's happening with your teaching."
            >
              <div className="mt-6 border-t border-neutral-900/5 pt-6 dark:border-white/10">
                {nextSession ? (
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-300">
                        Next class
                      </p>
                      <p className="mt-1.5 font-display text-xl font-semibold text-neutral-900 dark:text-neutral-50">
                        {nextSession.batch_title}
                      </p>
                      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                        {nextSessionSubject ? `${nextSessionSubject} · ` : ''}
                        {formatSessionTime(nextSession)} · {nextSession.duration_min} min
                      </p>
                      {nextSessionBatch && (
                        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                          Up to {nextSessionBatch.capacity} students
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {nextSession.meeting_url && (
                        <a
                          href={nextSession.meeting_url}
                          target="_blank"
                          rel="noreferrer"
                          className={buttonVariants({ variant: 'accent', size: 'sm' })}
                        >
                          Join class
                        </a>
                      )}
                      <Link
                        href={`/dashboard/sessions/${nextSession.id}`}
                        className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                      >
                        Mark attendance
                      </Link>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-neutral-600 dark:text-neutral-300">
                    <span className="font-medium text-neutral-800 dark:text-neutral-100">No upcoming classes.</span>{' '}
                    Schedule your next session from a batch.
                  </p>
                )}
              </div>
            </TeacherHero>
          </div>

          <div className="animate-fade-up" style={{ animationDelay: '80ms' }}>
            <StatBand>
              <StatBandItem icon={Layers} label="Active batches" value={activeBatches.length} />
              <StatBandItem icon={CalendarCheck} label="Classes today" value={todaySessions.length} />
              <StatBandItem icon={CalendarDays} label="Upcoming (14 days)" value={sessions?.length ?? 0} />
            </StatBand>
          </div>

          <section className="animate-fade-up" style={{ animationDelay: '120ms' }}>
            <SectionHeader eyebrow="Quick actions" title="Set up your teaching" />
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
          </section>

          <OnboardingChecklist batches={batches ?? []} />

          <section className="animate-fade-up" style={{ animationDelay: '160ms' }}>
            <SectionHeader eyebrow="What needs me" title="Needs attention" />
            {overdueSessions.length === 0 && unreadNotifications.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-neutral-400 dark:text-neutral-500">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                You&apos;re all caught up.
              </p>
            ) : (
              <div className="space-y-2">
                {overdueSessions.slice(0, 3).map((s) => (
                  <ActionCard
                    key={`overdue-${s.id}`}
                    href={`/dashboard/sessions/${s.id}`}
                    icon={ClipboardCheck}
                    label={`Mark attendance — ${s.batch_title}`}
                    meta={formatSessionTime(s)}
                    tone="warning"
                  />
                ))}
                {unreadNotifications.slice(0, 3).map((n) => (
                  <ActionCard
                    key={n.id}
                    href="/dashboard/messages"
                    icon={NOTIFICATION_ICON[n.type]?.icon ?? Megaphone}
                    label={n.payload.title}
                    meta={n.payload.body}
                    tone={n.type === 'new_message' ? 'info' : 'brand'}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="animate-fade-up" style={{ animationDelay: '200ms' }}>
            <SectionHeader eyebrow="Your classroom" title="Today's classes" />
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
                  <SessionCard
                    key={session.id}
                    batchTitle={session.batch_title}
                    timeLabel={formatSessionTime(session)}
                    durationMin={session.duration_min}
                    meetingUrl={session.meeting_url}
                    href={`/dashboard/sessions/${session.id}`}
                    emphasized={session.id === nextSession?.id}
                  />
                ))}
                {todaySessions.some((s) => s.status === 'scheduled') && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {todaySessions
                      .filter((s) => s.status === 'scheduled')
                      .map((s) => (
                        <Button key={s.id} variant="secondary" size="sm" onClick={() => void markComplete(s.id)}>
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                          Mark {s.batch_title} done
                        </Button>
                      ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {upcoming.length > 0 && (
            <section className="animate-fade-up" style={{ animationDelay: '240ms' }}>
              <SectionHeader eyebrow="Ahead" title="Coming up" />
              <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200/70 bg-white shadow-sm dark:divide-neutral-800/80 dark:border-neutral-800/80 dark:bg-surface">
                {upcoming.map((session) => (
                  <div key={session.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                        {session.batch_title}
                      </p>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">{formatSessionTime(session)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="animate-fade-up" style={{ animationDelay: '280ms' }}>
            <SectionHeader eyebrow="What's been happening" title="Recent activity" />
            {notifications && notifications.length > 0 ? (
              <ActivityFeed
                items={notifications.slice(0, 6).map((n) => ({
                  id: n.id,
                  icon: NOTIFICATION_ICON[n.type]?.icon ?? Megaphone,
                  tone: NOTIFICATION_ICON[n.type]?.tone ?? 'brand',
                  title: n.payload.title,
                  detail: n.payload.body,
                  timestamp: n.created_at,
                  unread: !n.read_at,
                }))}
              />
            ) : (
              <p className="text-sm text-neutral-400 dark:text-neutral-500">
                No recent activity yet — it will show up here as students message you or join a batch.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
