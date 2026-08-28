'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  ShieldCheck,
  AlertTriangle,
  MessageSquareText,
  Wallet,
  CalendarCheck,
  ClipboardCheck,
  Award,
  Megaphone,
  CheckCircle2,
  MessagesSquare,
  type LucideIcon,
} from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import { GREETING, dayPeriod, todayLabel } from '@/lib/greeting';
import { useCachedFetch } from '@/lib/use-cached-fetch';
import type {
  AppNotification,
  Digest,
  ParentLink,
  ProgressSummary,
  Session,
  StudentFeeEntry,
  ThreadSummary,
} from '@/lib/types';
import { EmptyState, CardSkeleton, ErrorState, Button, StatusBadge } from '@/components/ui';
import {
  ParentCard,
  ParentHero,
  ParentSectionHeader,
  ChildSwitcher,
  ChildOverviewCard,
  AttentionCard,
  LearningSnapshot,
  ActivityFeed,
  MessagePreview,
  ParentEmptyState,
  type SnapshotStat,
  type ActivityItem,
} from '@/components/parent';

/** Real, data-driven context line for the Parent hero — never a fake stat.
 *  Uses the already-assembled attention signals rather than fetching a
 *  child-schedule endpoint that doesn't exist yet, per-child aware for
 *  parents linked to more than one student. */
function parentContextLine(activeCount: number, attentionCount: number): string {
  if (activeCount === 0) return '';
  const childWord = activeCount === 1 ? 'child' : 'children';
  if (attentionCount === 0) return `${activeCount} ${childWord} linked · All caught up`;
  return `${activeCount} ${childWord} linked · ${attentionCount} item${attentionCount === 1 ? '' : 's'} need${attentionCount === 1 ? 's' : ''} attention`;
}

function sessionTime(session: Session): string {
  return new Date(session.scheduled_start_utc).toLocaleTimeString('en-IN', {
    timeZone: session.timezone,
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isSessionToday(session: Session, now: Date): boolean {
  return new Date(session.scheduled_start_utc).toDateString() === now.toDateString();
}

/** A day back (to still catch a class that started earlier today) to two
 *  weeks ahead — same window shape the Teacher/Academy dashboards use for
 *  their own "today's classes" derivation. */
function childSessionsPath(studentId: string): string {
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  return `/sessions/student/${studentId}?from=${from}&to=${to}`;
}

interface AttentionItem {
  key: string;
  icon: LucideIcon;
  label: string;
  meta?: string;
  href?: string;
  onClick?: () => void;
  tone: 'error' | 'warning' | 'info' | 'brand';
  priority: number;
}

const NOTIFICATION_ICON: Record<string, { icon: LucideIcon; tone: ActivityItem['tone'] }> = {
  new_message: { icon: MessageSquareText, tone: 'info' },
  attendance_absence_alert: { icon: AlertTriangle, tone: 'error' },
};

export default function ParentTodayPage() {
  const [consentingId, setConsentingId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const fetchBundle = useCallback(async () => {
    const [linksRes, digestsRes, notificationsRes, threadsRes] = await Promise.all([
      api.get<ParentLink[]>('/parent-links/me'),
      api.get<Digest[]>('/digests/me').catch(() => [] as Digest[]),
      api.get<AppNotification[]>('/notifications').catch(() => [] as AppNotification[]),
      api.get<ThreadSummary[]>('/messages/mine').catch(() => [] as ThreadSummary[]),
    ]);

    const active = linksRes.filter((l) => l.status === 'active');
    const perChild = await Promise.all(
      active.map((link) =>
        Promise.all([
          api.get<ProgressSummary>(`/progress/student/${link.student_id}`).catch(() => null),
          api.get<StudentFeeEntry[]>(`/fees/student/${link.student_id}`).catch(() => [] as StudentFeeEntry[]),
          api.get<Session[]>(childSessionsPath(link.student_id)).catch(() => [] as Session[]),
        ]).then(([progress, fees, sessions]) => [link.student_id, progress, fees, sessions] as const),
      ),
    );

    return {
      links: linksRes,
      digests: digestsRes,
      notifications: notificationsRes,
      threads: threadsRes,
      progressByChild: Object.fromEntries(perChild.map(([id, progress]) => [id, progress])) as Record<
        string,
        ProgressSummary | null
      >,
      feesByChild: Object.fromEntries(perChild.map(([id, , fees]) => [id, fees])) as Record<string, StudentFeeEntry[]>,
      sessionsByChild: Object.fromEntries(perChild.map(([id, , , sessions]) => [id, sessions])) as Record<
        string,
        Session[]
      >,
    };
  }, []);

  const { data: bundle, error: loadError, reload: load } = useCachedFetch('parent-dashboard', fetchBundle);

  const links = bundle?.links ?? null;
  const digests = bundle?.digests ?? [];
  const notifications = bundle?.notifications ?? [];
  const threads = bundle?.threads ?? [];
  const progressByChild = bundle?.progressByChild ?? {};
  const feesByChild = bundle?.feesByChild ?? {};
  const sessionsByChild = bundle?.sessionsByChild ?? {};

  async function grantConsent(linkId: string) {
    setConsentingId(linkId);
    try {
      await api.post(`/parent-links/${linkId}/consent`, { policyVersion: '1.0' });
      load();
    } finally {
      setConsentingId(null);
    }
  }

  const active = useMemo(() => links?.filter((l) => l.status === 'active') ?? [], [links]);
  const pending = useMemo(() => links?.filter((l) => l.status === 'pending') ?? [], [links]);

  function nameFor(studentId: string): string {
    return links?.find((l) => l.student_id === studentId)?.student_display_name ?? `Student ${studentId.slice(0, 8)}`;
  }

  function latestDigestFor(studentId: string): Digest | undefined {
    return digests.find((d) => d.student_id === studentId);
  }

  // Attention required — assembled only from real signals: pending
  // consent, repeated-absence alerts, unread messages, and fees due.
  const attentionItems: AttentionItem[] = [];

  for (const link of pending) {
    attentionItems.push({
      key: `consent-${link.id}`,
      icon: ShieldCheck,
      label: `Consent needed for ${link.student_display_name ?? `Student ${link.student_id.slice(0, 8)}`}`,
      meta: 'Grant DPDP consent to see their learning activity',
      onClick: () => void grantConsent(link.id),
      tone: 'brand',
      priority: 2,
    });
  }

  for (const n of notifications) {
    if (n.read_at) continue;
    if (n.type === 'attendance_absence_alert') {
      const payload = n.payload as { studentId?: string };
      attentionItems.push({
        key: `absence-${n.id}`,
        icon: AlertTriangle,
        label: n.payload.title,
        meta: n.payload.body,
        href: payload.studentId ? `/parent/child/${payload.studentId}/attendance` : undefined,
        tone: 'error',
        priority: 0,
      });
    } else if (n.type === 'new_message') {
      const payload = n.payload as { batchId?: string; studentId?: string };
      attentionItems.push({
        key: `message-${n.id}`,
        icon: MessageSquareText,
        label: n.payload.title,
        meta: n.payload.body,
        href: payload.batchId && payload.studentId ? `/parent/messages/${payload.batchId}/${payload.studentId}` : '/parent/messages',
        tone: 'info',
        priority: 1,
      });
    }
  }

  for (const link of active) {
    const due = (feesByChild[link.student_id] ?? []).filter((f) => f.status === 'due' || f.status === 'partial');
    if (due.length === 0) continue;
    attentionItems.push({
      key: `fees-${link.student_id}`,
      icon: Wallet,
      label: `Fee due — ${nameFor(link.student_id)}`,
      meta: `${due.length} ${due.length === 1 ? 'entry' : 'entries'} · ${formatMinor(
        due.reduce((sum, f) => sum + (f.expected_minor - (f.recorded_paid_minor ?? 0)), 0),
        due[0].currency,
      )}`,
      href: `/parent/child/${link.student_id}`,
      tone: 'warning',
      priority: 1,
    });
  }

  attentionItems.sort((a, b) => a.priority - b.priority);

  // Recent activity — the same real /notifications feed the bell reads.
  const activityItems: ActivityItem[] = notifications.slice(0, 6).map((n) => {
    const meta = NOTIFICATION_ICON[n.type];
    const payload = n.payload as { batchId?: string; studentId?: string };
    let href: string | undefined;
    if (n.type === 'new_message' && payload.batchId && payload.studentId) {
      href = `/parent/messages/${payload.batchId}/${payload.studentId}`;
    } else if (n.type === 'attendance_absence_alert' && payload.studentId) {
      href = `/parent/child/${payload.studentId}/attendance`;
    }
    return {
      id: n.id,
      icon: meta?.icon ?? Megaphone,
      tone: meta?.tone ?? 'brand',
      title: n.payload.title,
      detail: n.payload.body,
      timestamp: n.created_at,
      href,
      unread: !n.read_at,
    };
  });

  const recentThreads = [...threads]
    .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())
    .slice(0, 3);

  const now = new Date();

  const selectedLink = active.find((l) => l.student_id === selectedStudentId) ?? active[0] ?? null;
  const selectedProgress = selectedLink ? progressByChild[selectedLink.student_id] : undefined;
  const todaySessions = (selectedLink ? sessionsByChild[selectedLink.student_id] ?? [] : [])
    .filter((s) => isSessionToday(s, now))
    .sort((a, b) => new Date(a.scheduled_start_utc).getTime() - new Date(b.scheduled_start_utc).getTime());

  const snapshotStats: SnapshotStat[] = [];
  if (selectedProgress) {
    const { summary } = selectedProgress;
    if (summary.overallAttendanceRate !== null) {
      snapshotStats.push({
        icon: CalendarCheck,
        label: 'Attendance',
        value: `${summary.overallAttendanceRate}%`,
        detail: `Trend: ${summary.attendanceTrend}`,
      });
    }
    if (summary.overallAssignmentCompletionRate !== null) {
      snapshotStats.push({
        icon: ClipboardCheck,
        label: 'Assignments completed',
        value: `${summary.overallAssignmentCompletionRate}%`,
      });
    }
    if (summary.overallQuizAverageScorePercent !== null) {
      snapshotStats.push({
        icon: Award,
        label: 'Quiz average',
        value: `${summary.overallQuizAverageScorePercent}%`,
        detail: `Trend: ${summary.quizTrend}`,
      });
    }
  }

  const loading = links === null;
  const period = dayPeriod(now);

  return (
    <div className="space-y-8">
      {loading ? (
        <div className="space-y-8">
          <CardSkeleton className="h-56 rounded-3xl" />
          <div className="grid gap-4 sm:grid-cols-2">
            <CardSkeleton className="rounded-2xl" />
            <CardSkeleton className="rounded-2xl" />
          </div>
          <CardSkeleton className="rounded-2xl" />
        </div>
      ) : loadError ? (
        <ErrorState description="Could not load your dashboard. Check your connection and try again." onRetry={load} />
      ) : active.length === 0 && pending.length === 0 ? (
        <>
          <ParentHero
            period={period}
            greeting={`${GREETING[period]} 👋`}
            subtitle="Link your child's account to start seeing their learning activity."
          />
          <EmptyState
            icon={Users}
            title="No children linked yet"
            description="Ask your child to share their invite token from their app's settings, then link them here."
            action={
              <Link href="/parent/link">
                <Button>Link a child</Button>
              </Link>
            }
          />
        </>
      ) : (
        <>
          <div className="animate-fade-up" style={{ animationDelay: '0ms' }}>
            <ParentHero
              period={period}
              greeting={`${GREETING[period]} 👋`}
              subtitle={
                active.length > 0
                  ? active.length === 1
                    ? `Here's how ${nameFor(active[0].student_id)} is doing.`
                    : "Here's how your children are doing."
                  : 'Grant consent below to start seeing their learning activity.'
              }
            >
              <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
                {todayLabel(now)}
              </p>
              {active.length > 0 && (
                <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
                  {parentContextLine(active.length, attentionItems.length)}
                </p>
              )}
            </ParentHero>
          </div>

          {active.length > 0 && (
            <section className="animate-fade-up" style={{ animationDelay: '80ms' }}>
              <ParentSectionHeader eyebrow="Your children" title="Child overview" />
              <div className="grid gap-4 sm:grid-cols-2">
                {active.map((link) => {
                  const progress = progressByChild[link.student_id];
                  return (
                    <ChildOverviewCard
                      key={link.id}
                      name={nameFor(link.student_id)}
                      href={`/parent/child/${link.student_id}`}
                      digestNarrative={latestDigestFor(link.student_id)?.narrative}
                      attendanceRate={progress?.summary.overallAttendanceRate}
                      assignmentRate={progress?.summary.overallAssignmentCompletionRate}
                      quizRate={progress?.summary.overallQuizAverageScorePercent}
                    />
                  );
                })}
                {pending.map((link) => (
                  <ChildOverviewCard
                    key={link.id}
                    name={link.student_display_name ?? `Student ${link.student_id.slice(0, 8)}`}
                    consentPending
                    onGrantConsent={() => void grantConsent(link.id)}
                    consenting={consentingId === link.id}
                  />
                ))}
              </div>
            </section>
          )}

          {active.length === 0 && pending.length > 0 && (
            <section className="animate-fade-up" style={{ animationDelay: '80ms' }}>
              <ParentSectionHeader eyebrow="Awaiting consent" title="Finish linking your child" />
              <div className="grid gap-4 sm:grid-cols-2">
                {pending.map((link) => (
                  <ChildOverviewCard
                    key={link.id}
                    name={link.student_display_name ?? `Student ${link.student_id.slice(0, 8)}`}
                    consentPending
                    onGrantConsent={() => void grantConsent(link.id)}
                    consenting={consentingId === link.id}
                  />
                ))}
              </div>
            </section>
          )}

          {active.length > 1 && selectedLink && (
            <div className="animate-fade-up" style={{ animationDelay: '120ms' }}>
              <ChildSwitcher
                options={active.map((l) => ({ studentId: l.student_id, name: nameFor(l.student_id) }))}
                activeId={selectedLink.student_id}
                onSelect={setSelectedStudentId}
              />
            </div>
          )}

          {active.length > 0 && selectedLink && (
            <section className="animate-fade-up" style={{ animationDelay: '160ms' }}>
              <ParentSectionHeader
                eyebrow={active.length > 1 ? nameFor(selectedLink.student_id) : "Today's schedule"}
                title="What's next"
              />
              {todaySessions.length === 0 ? (
                <ParentEmptyState
                  icon={CalendarCheck}
                  title="No classes scheduled for today."
                  description={
                    active.length > 1
                      ? `Nothing on ${nameFor(selectedLink.student_id)}'s calendar today.`
                      : "There's nothing on the calendar today."
                  }
                />
              ) : (
                <ParentCard className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800/80">
                  {todaySessions.map((session) => (
                    <div key={session.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5">
                      <span className="w-16 shrink-0 font-display text-base font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
                        {sessionTime(session)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                          {session.batch_title}
                        </span>
                        <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                          {session.tutor_display_name ?? 'Teacher'} · {session.duration_min} min
                        </span>
                      </span>
                      <StatusBadge status={session.status} />
                    </div>
                  ))}
                </ParentCard>
              )}
            </section>
          )}

          <section className="animate-fade-up" style={{ animationDelay: '200ms' }}>
            <ParentSectionHeader eyebrow="Needs your attention" title="Attention required" />
            {attentionItems.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-neutral-400 dark:text-neutral-500">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                You&apos;re all caught up.
              </p>
            ) : (
              <div className="space-y-2">
                {attentionItems.slice(0, 6).map((item) => (
                  <AttentionCard
                    key={item.key}
                    href={item.href}
                    onClick={item.onClick}
                    icon={item.icon}
                    label={item.label}
                    meta={item.meta}
                    tone={item.tone}
                  />
                ))}
              </div>
            )}
          </section>

          {snapshotStats.length > 0 && selectedLink && (
            <section className="animate-fade-up" style={{ animationDelay: '240ms' }}>
              <ParentSectionHeader
                eyebrow={active.length > 1 ? nameFor(selectedLink.student_id) : undefined}
                title="Learning snapshot"
              />
              <LearningSnapshot stats={snapshotStats} />
            </section>
          )}

          <section className="animate-fade-up" style={{ animationDelay: '280ms' }}>
            <ParentSectionHeader eyebrow="What's been happening" title="Recent activity" />
            {activityItems.length === 0 ? (
              <ParentEmptyState
                icon={Megaphone}
                title="No recent activity"
                description="Learning activity will appear here as your child uses Scholar."
              />
            ) : (
              <ActivityFeed items={activityItems} />
            )}
          </section>

          <section className="animate-fade-up" style={{ animationDelay: '320ms' }}>
            <ParentSectionHeader eyebrow="Updates" title="Announcements" />
            <ParentEmptyState
              icon={Megaphone}
              title="No announcements yet"
              description="Updates from your child's tutors will appear here."
            />
          </section>

          <section className="animate-fade-up" style={{ animationDelay: '360ms' }}>
            <ParentSectionHeader eyebrow="Conversations" title="Messages" action={{ href: '/parent/messages', label: 'All messages' }} />
            {recentThreads.length === 0 ? (
              <ParentEmptyState
                icon={MessagesSquare}
                title="No conversations yet"
                description="Tutor conversations will appear here."
              />
            ) : (
              <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200/70 bg-white shadow-sm dark:divide-neutral-800/80 dark:border-neutral-800/80 dark:bg-surface">
                {recentThreads.map((thread) => {
                  const unread = notifications.some(
                    (n) =>
                      n.type === 'new_message' &&
                      !n.read_at &&
                      (n.payload as { batchId?: string; studentId?: string }).batchId === thread.batch_id &&
                      (n.payload as { batchId?: string; studentId?: string }).studentId === thread.student_id,
                  );
                  return (
                    <MessagePreview
                      key={`${thread.batch_id}-${thread.student_id}`}
                      href={`/parent/messages/${thread.batch_id}/${thread.student_id}`}
                      studentName={thread.student_display_name ?? `Student ${thread.student_id.slice(0, 8)}`}
                      batchTitle={thread.batch_title}
                      lastMessageAt={thread.last_message_at}
                      unread={unread}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
