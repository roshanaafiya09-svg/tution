'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck2, CheckCircle2, ClipboardCheck, Clock, Laptop, NotebookPen } from 'lucide-react';
import { api } from '@/lib/api';
import { currentAcademicWeekStart } from '@/lib/academic-week';
import { describeLoadError, type LoadErrorInfo } from '@/lib/load-error';
import type { AssessmentRow } from '@/lib/types';
import { buttonVariants, CardSkeleton, ErrorState, StatusBadge } from '@/components/ui';
import { TeacherPageHeader, AcademicCard, EmptyPanel, MetricCard } from '@/components/dashboard';

export default function AssessmentsOverviewPage() {
  const [rows, setRows] = useState<(AssessmentRow & { mode: 'online' | 'offline' })[] | null>(null);
  const [loadError, setLoadError] = useState<LoadErrorInfo | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    Promise.all([
      api.get<AssessmentRow[]>('/assessments/online/me'),
      api.get<AssessmentRow[]>('/assessments/offline/me'),
    ])
      .then(([online, offline]) => {
        const combined = [
          ...online.map((r) => ({ ...r, mode: 'online' as const })),
          ...offline.map((r) => ({ ...r, mode: 'offline' as const })),
        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setRows(combined);
      })
      .catch((err: unknown) => setLoadError(describeLoadError(err, 'your assessments')));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) {
    return <ErrorState title={loadError.title} description={loadError.description} onRetry={load} />;
  }

  if (rows === null) {
    return (
      <div className="space-y-4">
        <CardSkeleton className="h-24 rounded-2xl" />
        <CardSkeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  // Same definition of "this week" the Academy compliance dashboard uses:
  // the server-assigned Asia/Kolkata week_start_date. (Comparing
  // created_at against a browser-local Monday put an assessment created
  // this week for next week's date — or a late-Sunday IST one — in the
  // wrong week, so this page disagreed with what the academy saw.)
  const weekStart = currentAcademicWeekStart();
  const thisWeek = rows.filter((r) => r.week_start_date === weekStart);
  const weeklyDone = thisWeek.some((r) => r.status === 'completed');

  return (
    <div className="space-y-5">
      <TeacherPageHeader
        eyebrow="Teaching"
        title="Assessment"
        description="One weekly assessment, delivered to as many of your batches as you choose — online with AI-drafted questions, or offline with a mandatory question paper and Excel scorecard."
        action={
          <div className="flex gap-2">
            <Link href="/dashboard/assessments/online" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              <Laptop className="h-3.5 w-3.5" aria-hidden />
              Online
            </Link>
            <Link href="/dashboard/assessments/offline" className={buttonVariants({ size: 'sm' })}>
              <NotebookPen className="h-3.5 w-3.5" aria-hidden />
              Offline
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          icon={weeklyDone ? CheckCircle2 : Clock}
          label="This week"
          value={weeklyDone ? 'Compliant' : thisWeek.length > 0 ? 'In progress' : 'Not started'}
          hint={weeklyDone ? 'Weekly assessment completed' : 'At least one assessment is required per week'}
          tone={weeklyDone ? 'success' : thisWeek.length > 0 ? 'warning' : undefined}
        />
        <MetricCard icon={ClipboardCheck} label="Total assessments" value={rows.length} hint="All time" />
        <MetricCard
          icon={CalendarCheck2}
          label="Completed"
          value={rows.filter((r) => r.status === 'completed').length}
          hint="Auto-completed, never marked manually"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyPanel
          icon={ClipboardCheck}
          title="No assessments yet"
          description="Create an online assessment (AI-drafted from a PDF you upload) or an offline one (with a mandatory question paper and Excel scorecard) for one or more of your batches."
          steps={[
            'Choose Online or Offline',
            'Select one or more authorized batches',
            'Online: upload material and review AI questions. Offline: upload the question paper.',
            'Publish or schedule',
          ]}
          action={
            <Link href="/dashboard/assessments/online" className={buttonVariants({ size: 'sm' })}>
              Create your first assessment
            </Link>
          }
        />
      ) : (
        <AcademicCard className="p-0">
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {rows.slice(0, 20).map((row) => (
              <li key={row.id}>
                <Link
                  href={`/dashboard/assessments/${row.mode}/${row.id}`}
                  className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-neutral-50 sm:px-5 dark:hover:bg-neutral-800/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      {row.title}
                    </p>
                    <p className="text-xs text-neutral-400 dark:text-neutral-500 capitalize">
                      {row.mode} · {new Date(row.created_at).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                  <StatusBadge status={row.status} />
                </Link>
              </li>
            ))}
          </ul>
        </AcademicCard>
      )}
    </div>
  );
}
