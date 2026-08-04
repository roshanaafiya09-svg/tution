'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, formatMinor } from '@/lib/api';
import type { Digest, ProgressSummary, StudentFeeEntry } from '@/lib/types';
import { Card, PageHeader, EmptyState, StatusBadge } from '@/components/ui';

export default function ChildDetailPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const [digests, setDigests] = useState<Digest[]>([]);
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [fees, setFees] = useState<StudentFeeEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
      <PageHeader title={`Student ${studentId.slice(0, 8)}`} description="Progress, digests, and fee history." />

      {error && <p className="mb-4 text-sm text-error">{error}</p>}

      {progress && (
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-sm text-neutral-500">Attendance rate</p>
            <p className="mt-1 text-2xl font-semibold text-neutral-900">
              {progress.summary.overallAttendanceRate ?? '—'}%
            </p>
            <p className="mt-1 text-xs capitalize text-neutral-400">
              Trend: {progress.summary.attendanceTrend}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-neutral-500">Assignment completion</p>
            <p className="mt-1 text-2xl font-semibold text-neutral-900">
              {progress.summary.overallAssignmentCompletionRate ?? '—'}%
            </p>
          </Card>
          <Card>
            <p className="text-sm text-neutral-500">Quiz average</p>
            <p className="mt-1 text-2xl font-semibold text-neutral-900">
              {progress.summary.overallQuizAverageScorePercent ?? '—'}%
            </p>
            <p className="mt-1 text-xs capitalize text-neutral-400">Trend: {progress.summary.quizTrend}</p>
          </Card>
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold text-neutral-900">Weekly digests</h2>
      {digests.length === 0 ? (
        <div className="mb-8">
          <EmptyState title="No digests yet" description="A weekly summary appears here once one's generated." />
        </div>
      ) : (
        <div className="mb-8 space-y-3">
          {digests.map((digest) => (
            <Card key={digest.id}>
              <p className="text-sm font-medium text-neutral-900">
                {new Date(digest.period_start).toLocaleDateString('en-IN')} –{' '}
                {new Date(digest.period_end).toLocaleDateString('en-IN')}
              </p>
              <p className="mt-2 text-sm text-neutral-600">{digest.narrative}</p>
            </Card>
          ))}
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold text-neutral-900">Fee history</h2>
      {fees === null ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : fees.length === 0 ? (
        <EmptyState title="No fee records yet" description="Fees tracked by the tutor will show up here." />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0">
          {fees.map((fee) => (
            <div key={fee.id} className="flex items-center justify-between px-6 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900">{fee.batch_title}</p>
                <p className="text-sm text-neutral-500">
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
