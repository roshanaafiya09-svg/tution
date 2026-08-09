'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { CalendarCheck, ClipboardCheck, Award, TrendingUp, TrendingDown, Minus, MessageSquareText, Wallet, ArrowRight } from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import type { Digest, ParentLink, ProgressSummary, StudentFeeEntry } from '@/lib/types';
import { Card, PageHeader, EmptyState, StatusBadge, InlineError, PageLoading } from '@/components/ui';

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'up' || trend === 'improving') return <TrendingUp className="h-3 w-3" aria-hidden />;
  if (trend === 'down' || trend === 'declining') return <TrendingDown className="h-3 w-3" aria-hidden />;
  return <Minus className="h-3 w-3" aria-hidden />;
}

export default function ChildDetailPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const [digests, setDigests] = useState<Digest[]>([]);
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [fees, setFees] = useState<StudentFeeEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<ParentLink[]>('/parent-links/me')
      .then((links) => {
        const link = links.find((l) => l.student_id === studentId);
        if (link?.student_display_name) setDisplayName(link.student_display_name);
      });
    void api
      .get<Digest[]>('/digests/me')
      .then((all) => setDigests(all.filter((d) => d.student_id === studentId)));
    api
      .get<ProgressSummary>(`/progress/student/${studentId}`)
      .then(setProgress)
      .catch(() => setError('Could not load progress — the consent link may not be active yet.'));
    void api.get<StudentFeeEntry[]>(`/fees/student/${studentId}`).then(setFees).catch(() => setFees([]));
  }, [studentId]);

  return (
    <div>
      <PageHeader
        title={displayName ?? `Student ${studentId.slice(0, 8)}`}
        description="Progress, digests, and fee history."
        back={{ href: '/parent', label: 'Your children' }}
      />

      {error && (
        <div className="mb-4">
          <InlineError>{error}</InlineError>
        </div>
      )}

      {progress && (
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <Card className="flex items-start gap-3">
            <CalendarCheck className="mt-0.5 h-5 w-5 text-brand-500 dark:text-brand-300" aria-hidden />
            <div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Attendance rate</p>
              <p className="mt-0.5 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
                {progress.summary.overallAttendanceRate ?? '—'}%
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs capitalize text-neutral-400 dark:text-neutral-500">
                <TrendIcon trend={progress.summary.attendanceTrend} />
                Trend: {progress.summary.attendanceTrend}
              </p>
              <Link
                href={`/parent/child/${studentId}/attendance`}
                className="mt-2 flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-300"
              >
                View details
                <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            </div>
          </Card>
          <Card className="flex items-start gap-3">
            <ClipboardCheck className="mt-0.5 h-5 w-5 text-brand-500 dark:text-brand-300" aria-hidden />
            <div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Assignment completion</p>
              <p className="mt-0.5 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
                {progress.summary.overallAssignmentCompletionRate ?? '—'}%
              </p>
            </div>
          </Card>
          <Card className="flex items-start gap-3">
            <Award className="mt-0.5 h-5 w-5 text-brand-500 dark:text-brand-300" aria-hidden />
            <div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Quiz average</p>
              <p className="mt-0.5 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
                {progress.summary.overallQuizAverageScorePercent ?? '—'}%
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs capitalize text-neutral-400 dark:text-neutral-500">
                <TrendIcon trend={progress.summary.quizTrend} />
                Trend: {progress.summary.quizTrend}
              </p>
            </div>
          </Card>
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">Weekly digests</h2>
      {digests.length === 0 ? (
        <div className="mb-8">
          <EmptyState
            icon={MessageSquareText}
            title="No digests yet"
            description="A weekly summary appears here once one's generated."
          />
        </div>
      ) : (
        <div className="mb-8 space-y-3">
          {digests.map((digest) => (
            <Card key={digest.id}>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                {new Date(digest.period_start).toLocaleDateString('en-IN')} –{' '}
                {new Date(digest.period_end).toLocaleDateString('en-IN')}
              </p>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{digest.narrative}</p>
            </Card>
          ))}
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">Fee history</h2>
      {fees === null ? (
        <PageLoading />
      ) : fees.length === 0 ? (
        <EmptyState icon={Wallet} title="No fee records yet" description="Fees tracked by the tutor will show up here." />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
          {fees.map((fee) => (
            <div key={fee.id} className="flex items-center justify-between px-6 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{fee.batch_title}</p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {fee.period_label} · {formatMinor(fee.expected_minor, fee.currency)}
                </p>
              </div>
              <StatusBadge status={fee.status} />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
