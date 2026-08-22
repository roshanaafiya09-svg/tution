'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { GraduationCap, UserMinus } from 'lucide-react';
import { api } from '@/lib/api';
import type { AcademyManagedEnrollment } from '@/lib/types';
import { CardSkeleton, ConfirmDialog, EmptyState, ErrorState, StatusBadge, useToast } from '@/components/ui';
import { AcademyCard, AcademyPageIntro, AcademySetupBanner } from '@/components/academy';
import { academyInitials } from '@/lib/academies';
import { useAcademyDashboard } from '@/components/academy-shell';

export default function AcademyStudentsPage() {
  const toast = useToast();
  const { hasAcademy } = useAcademyDashboard();
  const [students, setStudents] = useState<AcademyManagedEnrollment[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<AcademyManagedEnrollment | null>(null);

  const load = useCallback(async () => {
    if (hasAcademy === false) {
      setStudents([]);
      return;
    }
    setLoadError(false);
    try {
      setStudents(await api.get<AcademyManagedEnrollment[]>('/academy/me/students'));
    } catch {
      setLoadError(true);
    }
  }, [hasAcademy]);

  useEffect(() => {
    void load();
  }, [load]);

  async function removeStudent() {
    if (!removeTarget) return;
    await api.delete(`/academy/me/batches/${removeTarget.batchId}/students/${removeTarget.studentId}`);
    toast({ title: `${removeTarget.displayName ?? 'Student'} removed from ${removeTarget.batchTitle}`, variant: 'success' });
    await load();
  }

  return (
    <div>
      <AcademySetupBanner />
      <AcademyPageIntro eyebrow="Academy Dashboard" title="Students" description="Students taught across your academy's teachers." />

      <div className="mt-8">
        {loadError ? (
          <ErrorState description="Could not load students. Check your connection and try again." onRetry={() => void load()} />
        ) : students === null ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : students.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No students yet"
            description="Students appear here once they join a batch — create a batch and share its invite link from Batches."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {students.map((s) => (
              <AcademyCard key={s.enrollmentId} className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                  {academyInitials(s.displayName)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{s.displayName ?? s.phoneE164}</p>
                    <StatusBadge status={s.status} />
                  </div>
                  <Link
                    href={`/academy/batches/${s.batchId}`}
                    className="mt-0.5 block text-xs text-brand-600 hover:underline dark:text-brand-300"
                  >
                    {s.batchTitle}
                  </Link>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">
                    Taught by {s.tutorDisplayName ?? 'Teacher'} · Joined {new Date(s.joinedAt).toLocaleDateString()}
                  </p>
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(s)}
                    className="mt-2 flex items-center gap-1 text-xs font-medium text-error hover:underline dark:text-error-dark"
                  >
                    <UserMinus className="h-3 w-3" aria-hidden />
                    Remove from batch
                  </button>
                </div>
              </AcademyCard>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        onConfirm={removeStudent}
        title={`Remove ${removeTarget?.displayName ?? 'this student'}?`}
        description={`They'll be removed from ${removeTarget?.batchTitle ?? 'this batch'}. This only affects this batch's enrollment.`}
        confirmLabel="Remove"
        danger
      />
    </div>
  );
}
