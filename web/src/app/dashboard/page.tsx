'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  BookMarked,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Layers,
  ListChecks,
  Megaphone,
  MessageSquareText,
  ShieldCheck,
  UserCircle,
  Users,
  Video,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import { currentPeriodLabel, loadRoster, type RosterData } from '@/lib/teacher-roster';
import type {
  AppNotification,
  Batch,
  FeeTotals,
  QuizDraftSummary,
  Session,
  Subject,
  TutorProfile,
  VerificationUpload,
} from '@/lib/types';
import {
  Button,
  buttonVariants,
  CardSkeleton,
  ErrorState,
  Skeleton,
  StatusBadge,
  useToast,
} from '@/components/ui';
import {
  TeacherHero,
  SectionHeader,
  ActionCard,
  ActivityFeed,
  AcademicCard,
  EmptyPanel,
  MetricCard,
  type DayPeriod,
  type ActivityItem,
} from '@/components/dashboard';
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist';

function sessionTime(session: Session): string {
  return new Date(session.scheduled_start_utc).toLocaleTimeString('en-IN', {
    timeZone: session.timezone,
    hour: 'numeric',
    minute: '2-digit',
  });
}

function sessionDateTime(session: Session): string {
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

/** A week back for un-marked classes, two weeks ahead for what's coming. */
function sessionsWindowPath(): string {
  const from = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const to = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
  return `/sessions/me?from=${from}&to=${to}`;
}

interface AttentionItem {
  key: string;
  href: string;
  icon: LucideIcon;
  label: string;
  meta: string;
  tone: 'error' | 'warning' | 'info' | 'brand';
}

export default function TodayPage() {
  const toast = useToast();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [feeTotals, setFeeTotals] = useState<FeeTotals | null>(null);
  const [quizDrafts, setQuizDrafts] = useState<QuizDraftSummary[]>([]);
  const [profile, setProfile] = useState<TutorProfile | null>(null);
  const [verifications, setVerifications] = useState<VerificationUpload[]>([]);
  const [roster, setRoster] = useState<RosterData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const periodLabel = currentPeriodLabel();

  const load = useCallback(() => {
    setLoadError(false);
    setSessions(null);
    setBatches(null);
    setRoster(null);

    // The default /sessions/me window starts "now", which would hide the
    // classes that already ran but never had attendance marked — exactly
    // the thing Needs your attention exists to surface.
    Promise.all([
      api.get<Session[]>(sessionsWindowPath()),
      api.get<Batch[]>('/batches/me'),
      api.get<Subject[]>('/catalog/subjects').catch(() => [] as Subject[]),
      api.get<AppNotification[]>('/notifications').catch(() => [] as AppNotification[]),
      api.get<FeeTotals | null>(`/fees/period/totals?period=${periodLabel}`).catch(() => null),
      api.get<QuizDraftSummary[]>('/quizzes/me').catch(() => [] as QuizDraftSummary[]),
      api.get<TutorProfile | null>('/profiles/tutor/me').catch(() => null),
      api.get<VerificationUpload[]>('/verifications/me').catch(() => [] as VerificationUpload[]),
    ])
      .then(([sessionRows, batchRows, subjectRows, notificationRows, totals, drafts, profileRow, verificationRows]) => {
        setSessions(sessionRows);
        setBatches(batchRows);
        setSubjects(subjectRows);
        setNotifications(notificationRows);
        setFeeTotals(totals);
        setQuizDrafts(drafts);
        setProfile(profileRow);
        setVerifications(verificationRows);
      })
      .catch(() => setLoadError(true));

    // The roster is a fan-out over every batch, so it fills the two tiles
    // that need it after the page has already painted rather than holding
    // the whole dashboard back.
    loadRoster(periodLabel)
      .then(setRoster)
      .catch(() => setRoster(null));
  }, [periodLabel]);

  useEffect(() => {
    load();
  }, [load]);

  async function markComplete(sessionId: string) {
    setCompletingId(sessionId);
    try {
      await api.post(`/sessions/${sessionId}/complete`);
      setSessions(await api.get<Session[]>(sessionsWindowPath()));
      toast({ title: 'Marked as done', variant: 'success' });
    } catch {
      toast({ title: 'Could not update the class', variant: 'error' });
    } finally {
      setCompletingId(null);
    }
  }

  const loading = sessions === null || batches === null;
  const now = new Date();
  const activeBatches = (batches ?? []).filter((b) => b.status === 'active');
  const todaySessions = (sessions ?? []).filter(isToday);
  const upcoming = (sessions ?? []).filter(
    (s) => !isToday(s) && s.status === 'scheduled' && new Date(s.scheduled_start_utc) >= now,
  );

  const nextSession =
    (sessions ?? [])
      .filter((s) => s.status === 'scheduled' && new Date(s.scheduled_start_utc) >= now)
      .sort((a, b) => new Date(a.scheduled_start_utc).getTime() - new Date(b.scheduled_start_utc).getTime())[0] ??
    null;
  const nextSessionBatch = nextSession ? (batches ?? []).find((b) => b.id === nextSession.batch_id) : undefined;
  const nextSessionSubject = nextSessionBatch
    ? subjects.find((s) => s.id === nextSessionBatch.subject_id)?.name_i18n.en
    : undefined;

  function batchOf(session: Session): Batch | undefined {
    return (batches ?? []).find((b) => b.id === session.batch_id);
  }

  function subjectOf(session: Session): string | undefined {
    const batch = batchOf(session);
    return batch ? subjects.find((s) => s.id === batch.subject_id)?.name_i18n.en : undefined;
  }

  function studentCountOf(session: Session): number | null {
    if (!roster) return null;
    return roster.students.filter(
      (student) => student.status === 'active' && student.batches.some((b) => b.id === session.batch_id),
    ).length;
  }

  const activeStudents = roster
    ? roster.students.filter((s) => s.status === 'active').length
    : null;
  const ratedStudents = (roster?.students ?? []).filter((s) => s.attendance.rate !== null);
  const averageAttendance =
    roster === null
      ? null
      : ratedStudents.length === 0
        ? 0
        : Math.round(ratedStudents.reduce((sum, s) => sum + (s.attendance.rate ?? 0), 0) / ratedStudents.length);

  const overdueSessions = (sessions ?? []).filter(
    (s) => s.status === 'scheduled' && new Date(s.scheduled_start_utc) < now,
  );
  const unreadNotifications = notifications.filter((n) => !n.read_at);
  const pendingDrafts = quizDrafts.filter((d) => d.status === 'pending_review');
  const verificationApproved =
    verifications.some((v) => v.type === 'id_proof' && v.status === 'approved') &&
    verifications.some((v) => v.type === 'qualification' && v.status === 'approved');
  const profileIncomplete = !profile || !profile.bio || !profile.headline;
  const soonSession =
    nextSession && new Date(nextSession.scheduled_start_utc).getTime() - now.getTime() < 24 * 3600 * 1000
      ? nextSession
      : null;

  const attention: AttentionItem[] = [];
  for (const session of overdueSessions.slice(0, 3)) {
    attention.push({
      key: `overdue-${session.id}`,
      href: `/dashboard/sessions/${session.id}`,
      icon: ClipboardCheck,
      label: `Mark attendance — ${session.batch_title}`,
      meta: `Class ended ${sessionDateTime(session)}`,
      tone: 'warning',
    });
  }
  if (feeTotals && feeTotals.outstandingMinor > 0) {
    attention.push({
      key: 'fees',
      href: '/dashboard/fees',
      icon: Wallet,
      label: `${formatMinor(feeTotals.outstandingMinor, feeTotals.currency)} in fees outstanding`,
      meta: `${feeTotals.entries - feeTotals.paidCount} of ${feeTotals.entries} students haven't paid for ${periodLabel}`,
      tone: 'error',
    });
  }
  if (pendingDrafts.length > 0) {
    attention.push({
      key: 'quizzes',
      href: '/dashboard/quizzes',
      icon: ListChecks,
      label: `${pendingDrafts.length} quiz draft${pendingDrafts.length === 1 ? '' : 's'} awaiting your review`,
      meta: 'Nothing reaches students until you approve it',
      tone: 'info',
    });
  }
  if (soonSession) {
    attention.push({
      key: 'prep',
      href: `/dashboard/sessions/${soonSession.id}`,
      icon: CalendarClock,
      label: `Next class: ${soonSession.batch_title}`,
      meta: `${sessionDateTime(soonSession)} · review materials and attendance`,
      tone: 'info',
    });
  }
  if (profileIncomplete) {
    attention.push({
      key: 'profile',
      href: '/dashboard/teacher-profile',
      icon: UserCircle,
      label: profile ? 'Finish your teaching profile' : 'Set up your teaching profile',
      meta: 'Students see this in Find a Teacher',
      tone: 'brand',
    });
  }
  if (!verificationApproved) {
    attention.push({
      key: 'verification',
      href: '/dashboard/verification',
      icon: ShieldCheck,
      label: verifications.length === 0 ? 'Verification not submitted' : 'Verification in progress',
      meta: 'ID and qualification approval unlock your verified badge',
      tone: 'brand',
    });
  }
  for (const notification of unreadNotifications.slice(0, 2)) {
    attention.push({
      key: `notification-${notification.id}`,
      href: '/dashboard/messages',
      icon: NOTIFICATION_ICON[notification.type]?.icon ?? Megaphone,
      label: notification.payload.title,
      meta: notification.payload.body,
      tone: 'info',
    });
  }

  const period = dayPeriod();
  const todayLabel = now.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  if (loadError) {
    return (
      <ErrorState
        description="Could not load your dashboard. Check your connection and try again."
        onRetry={load}
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <CardSkeleton className="h-52 rounded-3xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <CardSkeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <CardSkeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="animate-fade-up">
        <TeacherHero
          period={period}
          greeting={`${GREETING[period]} 👋`}
          subtitle="Here's what's happening with your teaching."
        >
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
            {todayLabel}
          </p>
          <div className="mt-6 border-t border-neutral-900/5 pt-6 dark:border-white/10">
            {nextSession ? (
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-300">
                    Next class
                  </p>
                  <p className="mt-1.5 font-display text-xl font-semibold text-neutral-900 dark:text-neutral-50">
                    {nextSession.batch_title}
                  </p>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                    {nextSessionSubject ? `${nextSessionSubject} · ` : ''}
                    {sessionDateTime(nextSession)} · {nextSession.duration_min} min
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {nextSession.meeting_url && (
                    <a
                      href={nextSession.meeting_url}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({ variant: 'accent', size: 'sm' })}
                    >
                      <Video className="h-3.5 w-3.5" aria-hidden />
                      Start class
                    </a>
                  )}
                  <Link
                    href={`/dashboard/sessions/${nextSession.id}`}
                    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                  >
                    View class
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                <span className="font-medium text-neutral-800 dark:text-neutral-100">No upcoming classes.</span>{' '}
                Schedule your next session from a batch, or open your{' '}
                <Link href="/dashboard/calendar" className="font-medium text-brand-700 underline dark:text-brand-300">
                  calendar
                </Link>
                .
              </p>
            )}
          </div>
        </TeacherHero>
      </div>

      <section className="animate-fade-up" style={{ animationDelay: '60ms' }}>
        <SectionHeader eyebrow="Overview" title="Your teaching at a glance" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard
            icon={Users}
            label="Active students"
            value={activeStudents === null ? <Skeleton className="h-6 w-10" /> : activeStudents}
            hint={`${activeBatches.length} active batch${activeBatches.length === 1 ? '' : 'es'}`}
            href="/dashboard/students"
          />
          <MetricCard
            icon={CalendarCheck}
            label="Classes today"
            value={todaySessions.length}
            hint={todaySessions.length === 0 ? 'Nothing scheduled' : `${todaySessions.filter((s) => s.status === 'scheduled').length} still to run`}
            href="/dashboard/calendar"
          />
          <MetricCard
            icon={CalendarDays}
            label="Upcoming classes"
            value={upcoming.length}
            hint="Next 14 days"
            href="/dashboard/calendar"
          />
          <MetricCard
            icon={Wallet}
            label="Pending fees"
            value={formatMinor(feeTotals?.outstandingMinor ?? 0, feeTotals?.currency ?? 'INR')}
            hint={
              feeTotals && feeTotals.entries > 0
                ? `${feeTotals.paidCount}/${feeTotals.entries} paid · ${periodLabel}`
                : `Nothing generated for ${periodLabel}`
            }
            tone={(feeTotals?.outstandingMinor ?? 0) > 0 ? 'warning' : 'success'}
            href="/dashboard/fees"
          />
          <MetricCard
            icon={ClipboardCheck}
            label="Attendance"
            value={
              averageAttendance === null ? (
                <Skeleton className="h-6 w-12" />
              ) : ratedStudents.length === 0 ? (
                '—'
              ) : (
                `${averageAttendance}%`
              )
            }
            hint={
              roster === null
                ? 'Loading…'
                : ratedStudents.length === 0
                  ? 'No attendance marked yet'
                  : `Average across ${ratedStudents.length} students`
            }
            tone={averageAttendance !== null && ratedStudents.length > 0 && averageAttendance < 70 ? 'warning' : 'brand'}
            href="/dashboard/students"
          />
        </div>
      </section>

      <section className="animate-fade-up" style={{ animationDelay: '120ms' }}>
        <SectionHeader eyebrow="Your classroom" title="Today's classes" action={{ href: '/dashboard/calendar', label: 'Calendar' }} />
        {todaySessions.length === 0 ? (
          <EmptyPanel
            icon={CalendarCheck}
            title={activeBatches.length === 0 ? 'Your teaching starts here' : 'No classes scheduled today'}
            description={
              activeBatches.length === 0
                ? 'Create your first batch to organise students, schedules, attendance and fees in one place.'
                : 'Nothing on today. Schedule your next class from a batch, or check what is coming up this week.'
            }
            steps={
              activeBatches.length === 0
                ? ['Create batch', 'Add students', 'Schedule classes', 'Start teaching']
                : undefined
            }
            action={
              activeBatches.length === 0 ? (
                <Link href="/dashboard/batches" className={buttonVariants({ size: 'sm' })}>
                  Create batch
                </Link>
              ) : (
                <>
                  <Link href="/dashboard/batches" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                    Schedule a class
                  </Link>
                  <Link href="/dashboard/calendar" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                    Open calendar
                  </Link>
                </>
              )
            }
          />
        ) : (
          <AcademicCard className="p-0">
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {todaySessions.map((session) => {
                const students = studentCountOf(session);
                const subject = subjectOf(session);
                return (
                  <li
                    key={session.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5"
                  >
                    <span className="w-16 shrink-0 font-display text-base font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
                      {sessionTime(session)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                        {session.batch_title}
                      </span>
                      <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                        {subject ? `${subject} · ` : ''}
                        {session.duration_min} min
                        {students !== null ? ` · ${students} student${students === 1 ? '' : 's'}` : ''}
                      </span>
                    </span>
                    <StatusBadge status={session.status} />
                    <span className="flex shrink-0 flex-wrap items-center gap-2">
                      {session.meeting_url && session.status === 'scheduled' && (
                        <a
                          href={session.meeting_url}
                          target="_blank"
                          rel="noreferrer"
                          className={buttonVariants({ variant: 'accent', size: 'sm' })}
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          Start
                        </a>
                      )}
                      <Link
                        href={`/dashboard/sessions/${session.id}`}
                        className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                      >
                        View class
                      </Link>
                      {session.status === 'scheduled' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void markComplete(session.id)}
                          disabled={completingId === session.id}
                          loading={completingId === session.id}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                          Done
                        </Button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </AcademicCard>
        )}
      </section>

      <section className="animate-fade-up" style={{ animationDelay: '160ms' }}>
        <SectionHeader eyebrow="What needs me" title="Needs your attention" />
        {attention.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl border border-neutral-200/70 bg-white px-4 py-3 text-sm text-neutral-500 dark:border-neutral-800/80 dark:bg-surface dark:text-neutral-400">
            <CheckCircle2 className="h-4 w-4 text-success dark:text-success-dark" aria-hidden />
            You&apos;re all caught up — nothing needs you right now.
          </p>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {attention.map((item) => (
              <ActionCard
                key={item.key}
                href={item.href}
                icon={item.icon}
                label={item.label}
                meta={item.meta}
                tone={item.tone}
              />
            ))}
          </div>
        )}
      </section>

      <OnboardingChecklist batches={batches ?? []} />

      {upcoming.length > 0 && (
        <section className="animate-fade-up" style={{ animationDelay: '200ms' }}>
          <SectionHeader eyebrow="Ahead" title="Coming up" action={{ href: '/dashboard/calendar', label: 'Full calendar' }} />
          <AcademicCard className="p-0">
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {upcoming.slice(0, 5).map((session) => (
                <li key={session.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      {session.batch_title}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{sessionDateTime(session)}</p>
                  </div>
                  <Link
                    href={`/dashboard/sessions/${session.id}`}
                    className="shrink-0 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
                  >
                    View
                  </Link>
                </li>
              ))}
            </ul>
          </AcademicCard>
        </section>
      )}

      <section className="animate-fade-up" style={{ animationDelay: '240ms' }}>
        <SectionHeader eyebrow="What's been happening" title="Recent activity" />
        {notifications.length > 0 ? (
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
          <p className="flex items-center gap-2 text-sm text-neutral-400 dark:text-neutral-500">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Nothing yet — activity shows up here as students message you or join a batch.
          </p>
        )}
      </section>

      <section className="animate-fade-up" style={{ animationDelay: '280ms' }}>
        <SectionHeader eyebrow="Shortcuts" title="Jump back in" />
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/batches" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            <Layers className="h-3.5 w-3.5" aria-hidden />
            Batches
          </Link>
          <Link href="/dashboard/students" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            <Users className="h-3.5 w-3.5" aria-hidden />
            Students
          </Link>
          <Link href="/dashboard/subjects" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            <BookMarked className="h-3.5 w-3.5" aria-hidden />
            Subjects & rates
          </Link>
          <Link href="/dashboard/availability" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            Availability
          </Link>
          <Link href="/dashboard/fees" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            <Wallet className="h-3.5 w-3.5" aria-hidden />
            Fees
          </Link>
        </div>
      </section>
    </div>
  );
}
