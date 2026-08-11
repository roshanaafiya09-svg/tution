'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  CalendarCheck,
  ClipboardCheck,
  Award,
  MessageSquareText,
  Wallet,
  AlertTriangle,
  CheckCircle2,
  MessagesSquare,
} from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import type { AppNotification, Digest, ParentLink, ProgressSummary, StudentFeeEntry, ThreadSummary } from '@/lib/types';
import { PageHeader, StatusBadge, InlineError, CardSkeleton } from '@/components/ui';
import {
  ParentCard,
  ParentSectionHeader,
  ParentEmptyState,
  AttentionCard,
  LearningSnapshot,
  MessagePreview,
  type SnapshotStat,
} from '@/components/parent';

export default function ChildDetailPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [digests, setDigests] = useState<Digest[]>([]);
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [fees, setFees] = useState<StudentFeeEntry[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      api.get<ParentLink[]>('/parent-links/me').catch(() => [] as ParentLink[]),
      api.get<Digest[]>('/digests/me').catch(() => [] as Digest[]),
      api.get<ProgressSummary>(`/progress/student/${studentId}`).catch(() => {
        setError('Could not load progress — the consent link may not be active yet.');
        return null;
      }),
      api.get<StudentFeeEntry[]>(`/fees/student/${studentId}`).catch(() => [] as StudentFeeEntry[]),
      api.get<AppNotification[]>('/notifications').catch(() => [] as AppNotification[]),
      api.get<ThreadSummary[]>('/messages/mine').catch(() => [] as ThreadSummary[]),
    ]).then(([links, digestsRes, progressRes, feesRes, notificationsRes, threadsRes]) => {
      const link = links.find((l) => l.student_id === studentId);
      setDisplayName(link?.student_display_name ?? null);
      setDigests(digestsRes.filter((d) => d.student_id === studentId));
      setProgress(progressRes);
      setFees(feesRes);
      setNotifications(notificationsRes);
      setThreads(threadsRes.filter((t) => t.student_id === studentId));
      setLoading(false);
    });
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const name = displayName ?? `Student ${studentId.slice(0, 8)}`;
  const dueFees = fees.filter((f) => f.status === 'due' || f.status === 'partial');
  const childNotifications = notifications.filter(
    (n) => (n.payload as { studentId?: string }).studentId === studentId && !n.read_at,
  );

  const attentionItems: {
    key: string;
    icon: typeof AlertTriangle;
    label: string;
    meta?: string;
    href: string;
    tone: 'error' | 'warning' | 'info';
  }[] = [];

  for (const n of childNotifications) {
    if (n.type === 'attendance_absence_alert') {
      attentionItems.push({
        key: n.id,
        icon: AlertTriangle,
        label: n.payload.title,
        meta: n.payload.body,
        href: `/parent/child/${studentId}/attendance`,
        tone: 'error',
      });
    } else if (n.type === 'new_message') {
      const payload = n.payload as { batchId?: string };
      attentionItems.push({
        key: n.id,
        icon: MessageSquareText,
        label: n.payload.title,
        meta: n.payload.body,
        href: payload.batchId ? `/parent/messages/${payload.batchId}/${studentId}` : '/parent/messages',
        tone: 'info',
      });
    }
  }
  if (dueFees.length > 0) {
    attentionItems.push({
      key: 'fees',
      icon: Wallet,
      label: 'Fee due',
      meta: `${dueFees.length} ${dueFees.length === 1 ? 'entry' : 'entries'} awaiting payment`,
      href: `/parent/child/${studentId}`,
      tone: 'warning',
    });
  }

  const snapshotStats: SnapshotStat[] = [];
  if (progress) {
    const { summary } = progress;
    if (summary.overallAttendanceRate !== null) {
      snapshotStats.push({
        icon: CalendarCheck,
        label: 'Attendance rate',
        value: `${summary.overallAttendanceRate}%`,
        detail: `Trend: ${summary.attendanceTrend}`,
      });
    }
    if (summary.overallAssignmentCompletionRate !== null) {
      snapshotStats.push({
        icon: ClipboardCheck,
        label: 'Assignment completion',
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

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Your child"
        title={name}
        description="Their learning journey — progress, attendance, and updates."
        back={{ href: '/parent', label: 'Your children' }}
      />

      {error && <InlineError>{error}</InlineError>}

      {loading ? (
        <div className="space-y-4">
          <CardSkeleton className="rounded-2xl" />
          <CardSkeleton className="rounded-2xl" />
        </div>
      ) : (
        <>
          <section>
            <ParentSectionHeader eyebrow="What's happening next" title="Upcoming" />
            <ParentEmptyState
              icon={CalendarCheck}
              title="No upcoming classes"
              description="There are no scheduled classes to show right now."
            />
          </section>

          <section>
            <ParentSectionHeader eyebrow="Needs your attention" title="Attention" />
            {attentionItems.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-neutral-400 dark:text-neutral-500">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                You&apos;re all caught up.
              </p>
            ) : (
              <div className="space-y-2">
                {attentionItems.map((item) => (
                  <AttentionCard
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

          {snapshotStats.length > 0 && (
            <section>
              <ParentSectionHeader eyebrow="How they're doing" title="Progress" />
              <LearningSnapshot stats={snapshotStats} />
              <Link
                href={`/parent/child/${studentId}/attendance`}
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
              >
                View attendance details →
              </Link>
            </section>
          )}

          <section>
            <ParentSectionHeader eyebrow="Summaries" title="Weekly digests" />
            {digests.length === 0 ? (
              <ParentEmptyState
                icon={MessageSquareText}
                title="No digests yet"
                description="A weekly summary appears here once one's generated."
              />
            ) : (
              <div className="space-y-3">
                {digests.map((digest) => (
                  <ParentCard key={digest.id}>
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      {new Date(digest.period_start).toLocaleDateString('en-IN')} –{' '}
                      {new Date(digest.period_end).toLocaleDateString('en-IN')}
                    </p>
                    <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{digest.narrative}</p>
                  </ParentCard>
                ))}
              </div>
            )}
          </section>

          <section>
            <ParentSectionHeader
              eyebrow="Talk to their tutor"
              title="Communication"
              action={{ href: '/parent/messages', label: 'All messages' }}
            />
            {threads.length === 0 ? (
              <ParentEmptyState
                icon={MessagesSquare}
                title="No conversations yet"
                description="Tutor conversations for this child will appear here."
              />
            ) : (
              <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200/70 bg-white shadow-sm dark:divide-neutral-800/80 dark:border-neutral-800/80 dark:bg-surface">
                {threads.map((thread) => (
                  <MessagePreview
                    key={thread.batch_id}
                    href={`/parent/messages/${thread.batch_id}/${studentId}`}
                    studentName={name}
                    batchTitle={thread.batch_title}
                    lastMessageAt={thread.last_message_at}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <ParentSectionHeader eyebrow="Billing" title="Fee history" />
            {fees.length === 0 ? (
              <ParentEmptyState icon={Wallet} title="No fee records yet" description="Fees tracked by the tutor will show up here." />
            ) : (
              <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200/70 bg-white shadow-sm dark:divide-neutral-800/80 dark:border-neutral-800/80 dark:bg-surface">
                {fees.map((fee) => (
                  <div key={fee.id} className="flex items-center justify-between px-5 py-3.5">
                    <div>
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{fee.batch_title}</p>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        {fee.period_label} · {formatMinor(fee.expected_minor, fee.currency)}
                      </p>
                    </div>
                    <StatusBadge status={fee.status} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
