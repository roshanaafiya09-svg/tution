'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, Phone, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import type { AcademyParentDetail } from '@/lib/types';
import { CardSkeleton, ErrorState, StatusBadge } from '@/components/ui';
import { AcademyCard, AcademyPageIntro, AcademySectionHeader } from '@/components/academy';

export default function AcademyParentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [parent, setParent] = useState<AcademyParentDetail | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoadError(null);
    setParent(null);
    api
      .get<AcademyParentDetail>(`/academy/me/parents/${id}`)
      .then(setParent)
      .catch((err: unknown) => setLoadError(err ?? true));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) {
    return <ErrorState error={loadError} what="this parent" onRetry={load} />;
  }

  if (!parent) {
    return (
      <div className="space-y-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const label = parent.children[0]?.displayName ? `Parent of ${parent.children[0].displayName}` : 'Parent';

  return (
    <div className="space-y-8">
      <AcademyPageIntro eyebrow="Parent" title={label} back={{ href: '/academy/parents', label: 'All parents' }} />

      <section>
        <AcademySectionHeader title="Contact" />
        <AcademyCard className="flex items-start gap-3">
          <UserRound
            className="h-12 w-12 shrink-0 rounded-full bg-brand-50 p-2.5 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
            aria-hidden
          />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="flex items-center gap-1.5 text-sm text-neutral-700 dark:text-neutral-300">
              <Phone className="h-3.5 w-3.5" aria-hidden />
              {parent.phoneE164}
            </p>
            {parent.email && (
              <p className="flex items-center gap-1.5 text-sm text-neutral-700 dark:text-neutral-300">
                <Mail className="h-3.5 w-3.5" aria-hidden />
                {parent.email}
              </p>
            )}
          </div>
        </AcademyCard>
      </section>

      <section>
        <AcademySectionHeader title="Children" />
        <div className="space-y-3">
          {parent.children.map((child) => (
            <AcademyCard key={child.studentId}>
              <div className="flex items-center justify-between gap-2">
                <Link
                  href={`/academy/students/${child.studentId}`}
                  className="text-sm font-medium text-neutral-900 hover:underline dark:text-neutral-50"
                >
                  {child.displayName ?? 'Student'}
                </Link>
                {child.gradeLevel && (
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">Grade {child.gradeLevel}</span>
                )}
              </div>
              <div className="mt-3 space-y-2">
                {child.batches.map((b) => (
                  <div
                    key={b.batchId}
                    className="flex items-center justify-between gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-xs dark:bg-neutral-900"
                  >
                    <div>
                      <Link href={`/academy/batches/${b.batchId}`} className="font-medium text-brand-600 hover:underline dark:text-brand-300">
                        {b.batchTitle}
                      </Link>
                      <p className="mt-0.5 text-neutral-500 dark:text-neutral-400">
                        {b.tutorDisplayName ?? 'Teacher'}
                        {b.attendance?.attendanceRate != null ? ` · ${b.attendance.attendanceRate}% attendance` : ''}
                      </p>
                    </div>
                    <StatusBadge status={b.status} />
                  </div>
                ))}
              </div>
            </AcademyCard>
          ))}
        </div>
      </section>
    </div>
  );
}
