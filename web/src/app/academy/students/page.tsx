'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, Search, UserMinus } from 'lucide-react';
import { api } from '@/lib/api';
import type { AcademyActiveTeacher, AcademyManagedBatch, AcademyManagedEnrollment } from '@/lib/types';
import { CardSkeleton, ConfirmDialog, EmptyState, ErrorState, Input, Select, StatusBadge, useToast } from '@/components/ui';
import { AcademyCard, AcademyPageIntro, AcademySetupBanner } from '@/components/academy';
import { academyInitials } from '@/lib/academies';
import { useAcademyDashboard } from '@/components/academy-shell';

export default function AcademyStudentsPage() {
  const toast = useToast();
  const router = useRouter();
  const { hasAcademy } = useAcademyDashboard();
  const [students, setStudents] = useState<AcademyManagedEnrollment[] | null>(null);
  const [batches, setBatches] = useState<AcademyManagedBatch[]>([]);
  const [teachers, setTeachers] = useState<AcademyActiveTeacher[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [removeTarget, setRemoveTarget] = useState<AcademyManagedEnrollment | null>(null);

  const [q, setQ] = useState('');
  const [batchId, setBatchId] = useState('');
  const [tutorId, setTutorId] = useState('');
  const [status, setStatus] = useState('active');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (filters: { q: string; batchId: string; tutorId: string; status: string }) => {
      if (hasAcademy === false) {
        setStudents([]);
        return;
      }
      setLoadError(null);
      try {
        const params = new URLSearchParams();
        if (filters.q) params.set('q', filters.q);
        if (filters.batchId) params.set('batchId', filters.batchId);
        if (filters.tutorId) params.set('tutorId', filters.tutorId);
        if (filters.status) params.set('status', filters.status);
        setStudents(await api.get<AcademyManagedEnrollment[]>(`/academy/me/students?${params.toString()}`));
      } catch (err: unknown) {
        setLoadError(err ?? true);
      }
    },
    [hasAcademy],
  );

  useEffect(() => {
    if (hasAcademy === false) {
      setStudents([]);
      return;
    }
    Promise.all([
      api.get<AcademyManagedBatch[]>('/academy/me/batches'),
      api.get<AcademyActiveTeacher[]>('/academy/me/teachers/active'),
    ]).then(([b, t]) => {
      setBatches(b);
      setTeachers(t);
    });
  }, [hasAcademy]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void load({ q, batchId, tutorId, status });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, batchId, tutorId, status, hasAcademy]);

  async function removeStudent() {
    if (!removeTarget) return;
    await api.delete(`/academy/me/batches/${removeTarget.batchId}/students/${removeTarget.studentId}`);
    toast({ title: `${removeTarget.displayName ?? 'Student'} removed from ${removeTarget.batchTitle}`, variant: 'success' });
    await load({ q, batchId, tutorId, status });
  }

  return (
    <div>
      <AcademySetupBanner />
      <AcademyPageIntro eyebrow="Academy Dashboard" title="Students" description="Students taught across your academy's teachers." />

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className="pl-9" />
        </div>
        <Select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
          <option value="">All batches</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </Select>
        <Select value={tutorId} onChange={(e) => setTutorId(e.target.value)}>
          <option value="">All teachers</option>
          {teachers.map((t) => (
            <option key={t.tutorId} value={t.tutorId}>
              {t.displayName ?? 'Teacher'}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:col-start-4">
          <option value="active">Active</option>
          <option value="left">Inactive</option>
          <option value="all">All statuses</option>
        </Select>
      </div>

      <div className="mt-6">
        {loadError ? (
          <ErrorState error={loadError} what="students" onRetry={() => void load({ q, batchId, tutorId, status })} />
        ) : students === null ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : students.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No students found"
            description={
              q || batchId || tutorId
                ? 'No students match your search or filters.'
                : "Students appear here once they join a batch — create a batch and share its invite link from Batches."
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {students.map((s) => (
              <AcademyCard
                key={s.enrollmentId}
                interactive
                onClick={() => router.push(`/academy/students/${s.studentId}`)}
                className="flex items-start gap-3"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                  {academyInitials(s.displayName)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{s.displayName ?? s.phoneE164}</p>
                    <StatusBadge status={s.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-brand-600 dark:text-brand-300">{s.batchTitle}</p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">
                    Taught by {s.tutorDisplayName ?? 'Teacher'}
                    {s.gradeLevel ? ` · Grade ${s.gradeLevel}` : ''} · Joined {new Date(s.joinedAt).toLocaleDateString()}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRemoveTarget(s);
                    }}
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
