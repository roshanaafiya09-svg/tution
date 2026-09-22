'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import {
  CalendarCheck,
  CalendarClock,
  ClipboardList,
  FileText,
  ListChecks,
  Megaphone,
  Video,
  CheckCircle2,
  User,
  type LucideIcon,
} from 'lucide-react';
import { api, apiGetPublic } from '@/lib/api';
import { safeHref } from '@/lib/safe-url';
import { GREETING, dayPeriod, todayLabel } from '@/lib/greeting';
import { useCachedFetch } from '@/lib/use-cached-fetch';
import type {
  Announcement,
  AttendanceSummary,
  Batch,
  Material,
  Session,
  StudentAssignmentSummary,
  StudentProfile,
  StudentQuizSummary,
  Subject,
} from '@/lib/types';
import { EmptyState, CardSkeleton, ErrorState, buttonVariants } from '@/components/ui';
import { HeroPanel, StatBand, StatBandItem, SectionHeader, ActionCard, AcademicCard } from '@/components/student';
import { useApiQuery } from '@/lib/query';

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

function taskTone(dueAtUtc: string): 'error' | 'warning' | 'brand' {
  const diff = new Date(dueAtUtc).getTime() - Date.now();
  if (diff < 0) return 'error';
  if (diff <= 24 * 60 * 60 * 1000) return 'warning';
  return 'brand';
}

/** Real, data-driven context line for the Student hero — never a fake stat. */
function studentContextLine(
  sessions: Session[] | null,
  assignments: StudentAssignmentSummary[] | null,
): string {
  if (sessions === null || assignments === null) return '';
  const now = new Date();
  const classesToday = sessions.filter((s) => new Date(s.scheduled_start_utc).toDateString() === now.toDateString()).length;
  const assignmentsDueToday = assignments.filter(
    (a) => !a.submission_id && new Date(a.due_at_utc).toDateString() === now.toDateString(),
  ).length;

  const parts: string[] = [];
  if (classesToday > 0) parts.push(`${classesToday} class${classesToday === 1 ? '' : 'es'} today`);
  if (assignmentsDueToday > 0) {
    parts.push(`${assignmentsDueToday} assignment${assignmentsDueToday === 1 ? '' : 's'} due today`);
  }
  if (parts.length === 0) return 'No classes scheduled for today. Enjoy your free time!';
  return parts.join(' · ');
}

interface AnnouncementWithBatch extends Announcement {
  batch_title: string;
}

interface QuizWithBatch extends StudentQuizSummary {
  batch_title: string;
}

interface Task {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  tone: 'error' | 'warning' | 'info' | 'brand';
  meta?: string;
}

interface RecentUpdate {
  key: string;
  icon: LucideIcon;
  batch_title: string;
  text: string;
  created_at: string;
}

export default function StudentTodayPage() {
  // The core: what the page cannot render without. Everything else is its own
  // widget query below, so one failing request marks only ITS widget as failed —
  // never a "0 quizzes available" or "No updates yet" for a request that failed.
  const fetchBundle = useCallback(async () => {
    const [sessionsRes, assignmentsRes, batchesRes, attendanceRes] = await Promise.all([
      api.get<Session[]>('/sessions/upcoming'),
      api.get<StudentAssignmentSummary[]>('/assignments/me'),
      api.get<Batch[]>('/batches/enrolled'),
      api.get<AttendanceSummary>('/attendance/me/summary'),
    ]);
    return { sessions: sessionsRes, assignments: assignmentsRes, batches: batchesRes, attendance: attendanceRes };
  }, []);

  const { data: bundle, error: loadError, reload: reloadBundle } = useCachedFetch('student-dashboard', fetchBundle);

  const profileQuery = useApiQuery(() => api.get<StudentProfile | undefined>('/profiles/student/me'), []);
  const subjectsQuery = useApiQuery(() => apiGetPublic<Subject[]>('/catalog/subjects'), []);
  const announcementsQuery = useApiQuery(() => api.get<Announcement[]>('/announcements/mine'), []);
  const quizzesQuery = useApiQuery(() => api.get<StudentQuizSummary[]>('/quizzes/batches/mine'), []);
  const materialsQuery = useApiQuery(() => api.get<Material[]>('/materials/mine'), []);

  function load() {
    reloadBundle();
    for (const query of [profileQuery, subjectsQuery, announcementsQuery, quizzesQuery, materialsQuery]) {
      void query.reload();
    }
  }

  const profile = profileQuery.data ?? null; // greeting only — falls back to a plain "Good morning"
  const sessions = bundle?.sessions ?? null;
  const assignments = bundle?.assignments ?? null;
  const batches = bundle?.batches ?? null;
  const subjects = subjectsQuery.data ?? null;
  const attendance = bundle?.attendance ?? null;

  const batchById = new Map((batches ?? []).map((b) => [b.id, b]));
  const allAnnouncements: AnnouncementWithBatch[] = (announcementsQuery.data ?? [])
    .filter((a) => a.batch_id && batchById.has(a.batch_id))
    .map((a) => ({ ...a, batch_title: batchById.get(a.batch_id!)!.title }));
  const allMaterials = (materialsQuery.data ?? [])
    .filter((m) => batchById.has(m.batch_id))
    .map((m) => ({ ...m, batch_title: batchById.get(m.batch_id)!.title }));
  const quizzes: QuizWithBatch[] = (quizzesQuery.data ?? [])
    .filter((q) => q.batchId && batchById.has(q.batchId))
    .map((q) => ({ ...q, batch_title: batchById.get(q.batchId!)!.title }));
  const updates: RecentUpdate[] = [
    ...allAnnouncements.map((a) => ({
      key: `announcement-${a.id}`,
      icon: Megaphone,
      batch_title: a.batch_title,
      text: a.body,
      created_at: a.created_at,
    })),
    ...allMaterials.map((m) => ({
      key: `material-${m.id}`,
      icon: FileText,
      batch_title: m.batch_title,
      text: `${m.title} uploaded`,
      created_at: m.created_at,
    })),
  ]
    .sort((x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime())
    .slice(0, 5);
  // The "updates" list is built from two requests; if either failed it is incomplete.
  const updatesError =
    announcementsQuery.status === 'error'
      ? announcementsQuery
      : materialsQuery.status === 'error'
        ? materialsQuery
        : null;

  const loading = sessions === null || assignments === null || batches === null || attendance === null;

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

  const pendingAssignments = (assignments ?? [])
    .filter((a) => !a.submission_id)
    .sort((a, b) => new Date(a.due_at_utc).getTime() - new Date(b.due_at_utc).getTime());
  const availableQuizzes = quizzes.filter((q) => !q.attempted);

  const tasks: Task[] = [
    ...pendingAssignments.map((a) => ({
      key: `assignment-${a.id}`,
      label: `Submit ${a.title}`,
      href: `/student/assignments/${a.id}`,
      icon: ClipboardList,
      tone: taskTone(a.due_at_utc),
      meta: `Due ${new Date(a.due_at_utc).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
    })),
    ...availableQuizzes.map((q) => ({
      key: `quiz-${q.id}`,
      label: `Complete ${q.title}`,
      href: `/student/quizzes/${q.id}`,
      icon: ListChecks,
      tone: 'brand' as const,
      meta: `${q.questionCount} question${q.questionCount === 1 ? '' : 's'}`,
    })),
  ];
  if (nextSession && new Date(nextSession.scheduled_start_utc).getTime() - now.getTime() <= 24 * 60 * 60 * 1000) {
    tasks.push({
      key: `session-${nextSession.id}`,
      label: `Attend ${nextSession.batch_title} class`,
      href: '/student/schedule',
      icon: CalendarCheck,
      tone: 'info',
      meta: formatSessionTime(nextSession),
    });
  }

  const period = dayPeriod(now);
  const contextLine = studentContextLine(sessions, assignments);

  return (
    <div className="space-y-8">
      {loading ? (
        <div className="space-y-8">
          <CardSkeleton className="h-64 rounded-3xl" />
          <div className="grid gap-4 sm:grid-cols-3">
            <CardSkeleton className="rounded-2xl" />
            <CardSkeleton className="rounded-2xl" />
            <CardSkeleton className="rounded-2xl" />
          </div>
          <CardSkeleton className="rounded-2xl" />
          <CardSkeleton className="rounded-2xl" />
        </div>
      ) : loadError ? (
        <ErrorState error={loadError} what="your dashboard" onRetry={load} />
      ) : (
        <>
          <div className="animate-fade-up" style={{ animationDelay: '0ms' }}>
            <HeroPanel
              period={period}
              greeting={profile ? `${GREETING[period]}, ${profile.display_name} 👋` : `${GREETING[period]} 👋`}
              subtitle="Here's what's happening with your learning."
            >
              <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
                {todayLabel(now)}
              </p>
              <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">{contextLine}</p>
            </HeroPanel>
          </div>

          <div className="animate-fade-up" style={{ animationDelay: '40ms' }}>
            <SectionHeader eyebrow="Up next" title="Next Class" />
            <AcademicCard>
              {nextSession ? (
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-display text-xl font-semibold text-neutral-900 dark:text-neutral-50">
                      {nextSessionSubject ?? nextSession.batch_title}
                    </p>
                    <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                      {nextSessionSubject ? `${nextSession.batch_title} · ` : ''}
                      {formatSessionTime(nextSession)} · {nextSession.duration_min} min
                    </p>
                    {nextSessionBatch?.tutor_display_name && (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
                        <User className="h-3.5 w-3.5" aria-hidden />
                        {nextSessionBatch.tutor_display_name}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {safeHref(nextSession.meeting_url) && (
                      <a
                        href={safeHref(nextSession.meeting_url)}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonVariants({ variant: 'accent', size: 'sm' })}
                      >
                        <Video className="h-3.5 w-3.5" aria-hidden />
                        Join class
                      </a>
                    )}
                    <Link href="/student/schedule" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                      View details
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <CalendarClock className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">No upcoming classes</p>
                    <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                      Your tutors haven&apos;t scheduled your next class yet.
                    </p>
                  </div>
                </div>
              )}
            </AcademicCard>
          </div>

          <div className="animate-fade-up" style={{ animationDelay: '80ms' }}>
            <SectionHeader eyebrow="Overview" title="Your week" />
            <StatBand>
              <StatBandItem
                icon={CalendarCheck}
                label="Attendance"
                value={attendance!.rate !== null ? `${attendance!.rate}%` : '—'}
                detail={attendance!.total > 0 ? `${attendance!.present} of ${attendance!.total} classes` : 'No classes recorded yet'}
                href="/student/attendance"
              />
              <StatBandItem
                icon={ClipboardList}
                label="Assignments"
                value={`${pendingAssignments.length} pending`}
                tone={pendingAssignments.length === 0 ? 'success' : 'warning'}
                detail={
                  pendingAssignments.length === 0
                    ? "You're all caught up"
                    : `Next due ${new Date(pendingAssignments[0].due_at_utc).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      })}`
                }
                href="/student/assignments"
              />
              <StatBandItem
                icon={ListChecks}
                label="Quizzes"
                value={quizzesQuery.status === 'success' ? `${availableQuizzes.length} available` : quizzesQuery.status === 'error' ? "Couldn't load" : '…'}
                detail={
                  quizzesQuery.status === 'error'
                    ? 'Tap to retry from the Quizzes page'
                    : quizzesQuery.status === 'loading'
                      ? 'Loading…'
                      : availableQuizzes.length === 0
                        ? "You're all caught up"
                        : 'Not attempted yet'
                }
                href="/student/quizzes"
              />
            </StatBand>
          </div>

          <section className="animate-fade-up" style={{ animationDelay: '160ms' }}>
            <SectionHeader eyebrow="What do I need to do" title="What needs your attention" />
            {quizzesQuery.status === 'error' && (
              <ErrorState
                compact
                className="mb-3"
                error={quizzesQuery.error}
                title="Some tasks couldn't be checked"
                message="We couldn't load your quizzes, so this list may be missing some."
                onRetry={() => void quizzesQuery.reload()}
              />
            )}
            {tasks.length === 0 && quizzesQuery.status !== 'error' ? (
              <EmptyState
                icon={CheckCircle2}
                title="You're all caught up 🎉"
                description="Nothing needs your attention right now."
              />
            ) : (
              <div className="space-y-2">
                {tasks.map((task) => (
                  <ActionCard
                    key={task.key}
                    href={task.href}
                    icon={task.icon}
                    label={task.label}
                    meta={task.meta}
                    tone={task.tone}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="animate-fade-up" style={{ animationDelay: '240ms' }}>
            <SectionHeader eyebrow="Recent updates" title="From your tutors" action={{ href: '/student/announcements', label: 'All announcements' }} />
            {updatesError && (
              <ErrorState
                compact
                className="mb-3"
                error={updatesError.error}
                what={updatesError === announcementsQuery ? 'your announcements' : 'your study materials'}
                onRetry={() => void updatesError.reload()}
              />
            )}
            {updates.length === 0 && !updatesError ? (
              <EmptyState
                icon={Megaphone}
                title="No updates yet"
                description="Announcements and materials from your tutors will appear here."
              />
            ) : (
              <AcademicCard className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
                {updates.map((u) => (
                  <div key={u.key} className="flex items-start gap-3 px-6 py-4">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                      <u.icon className="h-4 w-4" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{u.batch_title}</p>
                      <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">{u.text}</p>
                      <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                        {new Date(u.created_at).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </AcademicCard>
            )}
          </section>
        </>
      )}
    </div>
  );
}
