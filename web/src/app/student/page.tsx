'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  CalendarCheck,
  ClipboardList,
  ListChecks,
  Megaphone,
  Video,
  ArrowRight,
  CheckCircle2,
  Circle,
  User,
} from 'lucide-react';
import { api, apiGetPublic } from '@/lib/api';
import type {
  Announcement,
  AttendanceSummary,
  Batch,
  Session,
  StudentAssignmentSummary,
  StudentProfile,
  StudentQuizSummary,
  Subject,
} from '@/lib/types';
import { Card, PageHeader, EmptyState, CardSkeleton, ErrorState, StatCard, buttonVariants } from '@/components/ui';

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

function timeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
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
}

export default function StudentOverviewPage() {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [assignments, setAssignments] = useState<StudentAssignmentSummary[] | null>(null);
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementWithBatch[] | null>(null);
  const [quizzes, setQuizzes] = useState<QuizWithBatch[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    setSessions(null);
    setAssignments(null);
    setBatches(null);
    setSubjects(null);
    setAttendance(null);
    setAnnouncements(null);
    setQuizzes(null);

    Promise.all([
      api.get<StudentProfile | undefined>('/profiles/student/me').catch(() => undefined),
      api.get<Session[]>('/sessions/upcoming'),
      api.get<StudentAssignmentSummary[]>('/assignments/me'),
      api.get<Batch[]>('/batches/enrolled'),
      apiGetPublic<Subject[]>('/catalog/subjects'),
      api.get<AttendanceSummary>('/attendance/me/summary'),
    ])
      .then(async ([profileRes, sessionsRes, assignmentsRes, batchesRes, subjectsRes, attendanceRes]) => {
        setProfile(profileRes ?? null);
        setSessions(sessionsRes);
        setAssignments(assignmentsRes);
        setBatches(batchesRes);
        setSubjects(subjectsRes);
        setAttendance(attendanceRes);

        const perBatch = await Promise.all(
          batchesRes.map((batch) =>
            Promise.all([
              api
                .get<Announcement[]>(`/announcements/batch/${batch.id}`)
                .then((list) => list.map((a) => ({ ...a, batch_title: batch.title })))
                .catch(() => [] as AnnouncementWithBatch[]),
              api
                .get<StudentQuizSummary[]>(`/quizzes/batch/${batch.id}`)
                .then((list) => list.map((q) => ({ ...q, batch_title: batch.title })))
                .catch(() => [] as QuizWithBatch[]),
            ]),
          ),
        );

        setAnnouncements(
          perBatch
            .flatMap(([a]) => a)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 5),
        );
        setQuizzes(perBatch.flatMap(([, q]) => q));
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loading =
    sessions === null ||
    assignments === null ||
    batches === null ||
    subjects === null ||
    attendance === null ||
    announcements === null ||
    quizzes === null;

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
  const availableQuizzes = (quizzes ?? []).filter((q) => !q.attempted);

  const tasks: Task[] = [
    ...pendingAssignments.slice(0, 3).map((a) => ({
      key: `assignment-${a.id}`,
      label: `Submit ${a.title}`,
      href: `/student/assignments/${a.id}`,
    })),
    ...availableQuizzes.slice(0, 2).map((q) => ({
      key: `quiz-${q.id}`,
      label: `Complete ${q.title}`,
      href: `/student/quizzes/${q.id}`,
    })),
  ];
  if (nextSession && new Date(nextSession.scheduled_start_utc).getTime() - now.getTime() <= 24 * 60 * 60 * 1000) {
    tasks.push({
      key: `session-${nextSession.id}`,
      label: `Attend ${nextSession.batch_title} class`,
      href: '/student/schedule',
    });
  }
  tasks.splice(5);

  return (
    <div>
      <PageHeader
        title={profile ? `${timeGreeting()}, ${profile.display_name} 👋` : `${timeGreeting()} 👋`}
        description="Here's what's happening with your learning."
      />

      {loading ? (
        <div className="space-y-8">
          <CardSkeleton />
          <div className="grid gap-4 sm:grid-cols-3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : loadError ? (
        <ErrorState description="Could not load your dashboard. Check your connection and try again." onRetry={load} />
      ) : (
        <div className="space-y-8">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Next class</h2>
              <Link
                href="/student/schedule"
                className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
              >
                Full schedule
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
            {nextSession ? (
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
                    {nextSessionBatch?.tutor_display_name && (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
                        <User className="h-3.5 w-3.5" aria-hidden />
                        {nextSessionBatch.tutor_display_name}
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
                    <Link href="/student/schedule" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                      View details
                    </Link>
                  </div>
                </div>
              </Card>
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="No upcoming classes"
                description="Your tutor hasn't scheduled your next class yet."
              />
            )}
          </section>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard icon={CalendarCheck} label="Attendance" value={attendance!.rate !== null ? `${attendance!.rate}%` : '—'}>
              <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                {attendance!.total > 0
                  ? `${attendance!.present} of ${attendance!.total} classes`
                  : 'No classes recorded yet'}
              </p>
            </StatCard>
            <StatCard icon={ClipboardList} label="Assignments" value={`${pendingAssignments.length} pending`}>
              <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                {pendingAssignments.length === 0
                  ? "You're all caught up"
                  : `Next due ${new Date(pendingAssignments[0].due_at_utc).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                    })}`}
              </p>
            </StatCard>
            <StatCard icon={ListChecks} label="Quizzes" value={`${availableQuizzes.length} available`}>
              <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                {availableQuizzes.length === 0 ? "You're all caught up" : 'Not attempted yet'}
              </p>
            </StatCard>
          </div>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">What&apos;s next</h2>
            {tasks.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-neutral-400 dark:text-neutral-500">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                You&apos;re all caught up — nothing needs your attention right now.
              </p>
            ) : (
              <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
                {tasks.map((task) => (
                  <Link
                    key={task.key}
                    href={task.href}
                    className="flex items-center gap-3 px-6 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                  >
                    <Circle className="h-4 w-4 shrink-0 text-neutral-300 dark:text-neutral-600" aria-hidden />
                    <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{task.label}</p>
                  </Link>
                ))}
              </Card>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Recent updates</h2>
              <Link
                href="/student/announcements"
                className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
              >
                All announcements
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
            {(announcements?.length ?? 0) === 0 ? (
              <EmptyState
                icon={Megaphone}
                title="No announcements yet"
                description="Updates from your tutors will appear here."
              />
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
