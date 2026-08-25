'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, ClipboardList, FileText, ListChecks, Megaphone, User, Video } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { safeHref } from '@/lib/safe-url';
import type { Announcement, Material, Session, StudentAssignmentSummary, StudentQuizSummary } from '@/lib/types';
import { CardSkeleton, ErrorState, EmptyState, buttonVariants } from '@/components/ui';
import { AcademicCard, ActionCard, SectionHeader, useBatchWorkspace } from '@/components/student';

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

interface Task {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  tone: 'error' | 'warning' | 'brand';
  meta?: string;
}

interface RecentUpdate {
  key: string;
  icon: LucideIcon;
  text: string;
  created_at: string;
}

/** The batch workspace's own Overview tab — a batch-scoped mini version of
 *  the global student Overview: next class, what needs attention, and
 *  recent updates, all filtered to this one batch. */
export default function BatchOverviewTab() {
  const { batch, subjectName } = useBatchWorkspace();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [assignments, setAssignments] = useState<StudentAssignmentSummary[] | null>(null);
  const [quizzes, setQuizzes] = useState<StudentQuizSummary[] | null>(null);
  const [updates, setUpdates] = useState<RecentUpdate[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    setSessions(null);
    setAssignments(null);
    setQuizzes(null);
    setUpdates(null);
    Promise.all([
      api.get<Session[]>('/sessions/upcoming'),
      api.get<StudentAssignmentSummary[]>('/assignments/me'),
      api.get<StudentQuizSummary[]>(`/quizzes/batch/${batch.id}`),
      api.get<Material[]>(`/materials/batch/${batch.id}`),
      api.get<Announcement[]>(`/announcements/batch/${batch.id}`),
    ])
      .then(([allSessions, allAssignments, quizzesRes, materialsRes, announcementsRes]) => {
        setSessions(allSessions.filter((s) => s.batch_id === batch.id));
        setAssignments(allAssignments.filter((a) => a.batch_id === batch.id));
        setQuizzes(quizzesRes);

        const merged: RecentUpdate[] = [
          ...announcementsRes.map((a) => ({
            key: `announcement-${a.id}`,
            icon: Megaphone,
            text: a.body,
            created_at: a.created_at,
          })),
          ...materialsRes.map((m) => ({
            key: `material-${m.id}`,
            icon: FileText,
            text: `${m.title} uploaded`,
            created_at: m.created_at,
          })),
        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setUpdates(merged.slice(0, 5));
      })
      .catch(() => setLoadError(true));
  }, [batch.id]);

  useEffect(() => {
    load();
  }, [load]);

  const loading = sessions === null || assignments === null || quizzes === null || updates === null;

  if (loading) {
    return (
      <div className="space-y-8">
        <CardSkeleton className="rounded-2xl" />
        <CardSkeleton className="rounded-2xl" />
        <CardSkeleton className="rounded-2xl" />
      </div>
    );
  }
  if (loadError) {
    return <ErrorState description="Could not load this batch. Check your connection and try again." onRetry={load} />;
  }

  const now = new Date();
  const nextSession = sessions
    .filter((s) => s.status === 'scheduled' && new Date(s.scheduled_start_utc) >= now)
    .sort((a, b) => new Date(a.scheduled_start_utc).getTime() - new Date(b.scheduled_start_utc).getTime())[0];

  const pendingAssignments = assignments
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

  return (
    <div className="space-y-8">
      <div>
        <SectionHeader eyebrow="Up next" title="Next Class" />
        <AcademicCard>
          {nextSession ? (
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-display text-xl font-semibold text-neutral-900 dark:text-neutral-50">
                  {subjectName ?? batch.title}
                </p>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                  {formatSessionTime(nextSession)} · {nextSession.duration_min} min
                </p>
                {batch.tutor_display_name && (
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
                    <User className="h-3.5 w-3.5" aria-hidden />
                    {batch.tutor_display_name}
                  </p>
                )}
              </div>
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
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <CalendarClock className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden />
              <div>
                <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">No upcoming classes</p>
                <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                  Your tutor hasn&apos;t scheduled a class yet.
                </p>
              </div>
            </div>
          )}
        </AcademicCard>
      </div>

      <section>
        <SectionHeader eyebrow="What do I need to do" title="What needs your attention" />
        {tasks.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="You're all caught up 🎉" description="Nothing needs your attention right now." />
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <ActionCard key={task.key} href={task.href} icon={task.icon} label={task.label} meta={task.meta} tone={task.tone} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeader eyebrow="Recent updates" title="From your tutor" action={{ href: `/student/batches/${batch.id}/announcements`, label: 'All announcements' }} />
        {updates.length === 0 ? (
          <EmptyState icon={Megaphone} title="No updates yet" description="Announcements and materials from your tutor will appear here." />
        ) : (
          <AcademicCard className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
            {updates.map((u) => (
              <div key={u.key} className="flex items-start gap-3 px-6 py-4">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                  <u.icon className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">{u.text}</p>
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
    </div>
  );
}
