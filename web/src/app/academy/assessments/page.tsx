'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ClipboardCheck } from 'lucide-react';
import { api } from '@/lib/api';
import type { WeeklyComplianceResponse } from '@/lib/types';
import { CardSkeleton, ErrorState, StatusBadge } from '@/components/ui';
import { AcademyCard, AcademyPageIntro, AcademySetupBanner } from '@/components/academy';
import { useAcademyDashboard } from '@/components/academy-shell';

/** What an account with no academy row yet sees — the endpoint 404s for it
 *  ("No academy is linked"), so it is never called; same convention as every
 *  other Academy page (see AcademySetupBanner). */
const NO_ACADEMY_COMPLIANCE: WeeklyComplianceResponse = {
  weekStartDate: '',
  summary: { teachers: 0, completed: 0, pending: 0, overdue: 0, notScheduled: 0 },
  teachers: [],
};

export default function AcademyAssessmentsPage() {
  const { hasAcademy } = useAcademyDashboard();
  const [data, setData] = useState<WeeklyComplianceResponse | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    if (hasAcademy === false) {
      setData(NO_ACADEMY_COMPLIANCE);
      return;
    }
    api
      .get<WeeklyComplianceResponse>('/academy/me/assessments/weekly-compliance')
      .then(setData)
      .catch(() => setLoadError(true));
  }, [hasAcademy]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) {
    return <ErrorState description="Could not load weekly assessment compliance. Check your connection and try again." onRetry={load} />;
  }

  if (data === null) {
    return (
      <div className="space-y-4">
        <CardSkeleton className="h-24 rounded-2xl" />
        <CardSkeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <AcademySetupBanner />
      <AcademyPageIntro
        eyebrow="Academic"
        title="Weekly Assessment Compliance"
        description="Every teacher needs at least one assessment per week — online or offline, across as many batches as they teach. This is an operational view, not a ranking."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryTile label="Teachers" value={data.summary.teachers} />
        <SummaryTile label="Completed" value={data.summary.completed} tone="success" />
        <SummaryTile label="Pending" value={data.summary.pending} tone="warning" />
        <SummaryTile label="Overdue" value={data.summary.overdue} tone="error" />
        <SummaryTile label="Not scheduled" value={data.summary.notScheduled} />
      </div>

      {data.teachers.length === 0 ? (
        <AcademyCard>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">No active teachers in your academy yet.</p>
        </AcademyCard>
      ) : (
        <AcademyCard className="p-0">
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {data.teachers.map((row) => {
              const content = (
                <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      {row.teacherDisplayName ?? row.tutorId.slice(0, 8)}
                    </p>
                    <p className="truncate text-xs text-neutral-400 dark:text-neutral-500">
                      {row.assessment
                        ? `${row.assessment.title} · ${row.assessment.mode} · ${row.assessment.batchCount} batch${row.assessment.batchCount === 1 ? '' : 'es'}${row.additionalAssessmentCount > 0 ? ` (+${row.additionalAssessmentCount} more this week)` : ''}`
                        : 'No assessment created this week'}
                    </p>
                  </div>
                  <StatusBadge status={row.status} />
                  {row.assessment && <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300 dark:text-neutral-600" aria-hidden />}
                </div>
              );
              return (
                <li key={row.tutorId}>
                  {row.assessment ? (
                    <Link
                      href={`/academy/assessments/${row.assessment.id}`}
                      className="block transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                    >
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ul>
        </AcademyCard>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'success' | 'warning' | 'error';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-success dark:text-success-dark'
      : tone === 'warning'
        ? 'text-warning dark:text-warning-dark'
        : tone === 'error'
          ? 'text-error dark:text-error-dark'
          : 'text-neutral-900 dark:text-neutral-50';
  return (
    <AcademyCard className="flex flex-col items-center justify-center gap-1 py-4 text-center">
      <ClipboardCheck className="h-4 w-4 text-neutral-300 dark:text-neutral-600" aria-hidden />
      <p className={`text-xl font-semibold ${toneClass}`}>{value}</p>
      <p className="text-xs text-neutral-400 dark:text-neutral-500">{label}</p>
    </AcademyCard>
  );
}
