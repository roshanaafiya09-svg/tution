'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, Phone, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import type { AcademyStudentDetail } from '@/lib/types';
import { CardSkeleton, EmptyState, ErrorState, StatusBadge } from '@/components/ui';
import { AcademyCard, AcademyPageIntro, AcademySectionHeader } from '@/components/academy';
import { academyInitials } from '@/lib/academies';

export default function AcademyStudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [student, setStudent] = useState<AcademyStudentDetail | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    setStudent(null);
    api
      .get<AcademyStudentDetail>(`/academy/me/students/${id}`)
      .then(setStudent)
      .catch(() => setLoadError(true));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) {
    return <ErrorState description="Could not load this student. Check your connection and try again." onRetry={load} />;
  }

  if (!student) {
    return (
      <div className="space-y-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AcademyPageIntro
        eyebrow="Student"
        title={student.displayName ?? student.phoneE164}
        description={student.gradeLevel ? `Grade ${student.gradeLevel}` : undefined}
        back={{ href: '/academy/students', label: 'All students' }}
      />

      <section>
        <AcademySectionHeader title="Student" />
        <AcademyCard className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            {academyInitials(student.displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{student.displayName ?? 'Student'}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
              <Phone className="h-3 w-3" aria-hidden />
              {student.phoneE164}
            </p>
            {student.gradeLevel && <p className="text-xs text-neutral-500 dark:text-neutral-400">Grade {student.gradeLevel}</p>}
          </div>
        </AcademyCard>
      </section>

      <section>
        <AcademySectionHeader title="Batches & attendance" />
        {student.enrollments.length === 0 ? (
          <EmptyState icon={BookOpen} title="No batches" description="This student isn't enrolled in any batch at your academy." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {student.enrollments.map((e) => (
              <AcademyCard key={e.enrollmentId}>
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/academy/batches/${e.batchId}`}
                    className="text-sm font-medium text-neutral-900 hover:underline dark:text-neutral-50"
                  >
                    {e.batchTitle}
                  </Link>
                  <StatusBadge status={e.status} />
                </div>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Taught by {e.tutorDisplayName ?? 'Teacher'} · Joined {new Date(e.joinedAt).toLocaleDateString()}
                </p>
                {e.attendance && (
                  <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                    {e.attendance.attendanceRate != null ? `${e.attendance.attendanceRate}% attendance` : 'No sessions yet'} ·{' '}
                    {e.attendance.present + e.attendance.late} / {e.attendance.total} attended
                  </p>
                )}
              </AcademyCard>
            ))}
          </div>
        )}
      </section>

      <section>
        <AcademySectionHeader title="Parents" />
        {student.parents.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">No parent linked yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {student.parents.map((p) => (
              <AcademyCard key={p.parentId} className="flex items-center gap-3">
                <UserRound className="h-8 w-8 shrink-0 rounded-full bg-neutral-100 p-1.5 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400" aria-hidden />
                <div className="min-w-0 flex-1">
                  <Link href={`/academy/parents/${p.parentId}`} className="text-sm font-medium text-neutral-900 hover:underline dark:text-neutral-50">
                    {p.phoneE164}
                  </Link>
                  {p.email && <p className="text-xs text-neutral-500 dark:text-neutral-400">{p.email}</p>}
                </div>
              </AcademyCard>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
