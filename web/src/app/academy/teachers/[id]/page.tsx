'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { BookOpen, CalendarClock, CalendarOff, GraduationCap, Languages } from 'lucide-react';
import { api } from '@/lib/api';
import type { AcademyTeacherDetail } from '@/lib/types';
import { CardSkeleton, EmptyState, ErrorState, StatusBadge } from '@/components/ui';
import { AcademyCard, AcademyPageIntro, AcademySectionHeader } from '@/components/academy';
import { academyInitials } from '@/lib/academies';

export default function AcademyTeacherDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [teacher, setTeacher] = useState<AcademyTeacherDetail | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoadError(null);
    setTeacher(null);
    api
      .get<AcademyTeacherDetail>(`/academy/me/teachers/${id}`)
      .then(setTeacher)
      .catch((err: unknown) => setLoadError(err ?? true));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) {
    return <ErrorState error={loadError} what="this teacher" onRetry={load} />;
  }

  if (!teacher) {
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
        eyebrow="Teacher"
        title={teacher.displayName ?? 'Teacher'}
        description={teacher.headline ?? undefined}
        back={{ href: '/academy/teachers', label: 'All teachers' }}
      />

      <section>
        <AcademySectionHeader title="Profile" />
        <AcademyCard className="flex flex-wrap items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-lg font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            {teacher.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={teacher.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              academyInitials(teacher.displayName)
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{teacher.displayName ?? 'Teacher'}</p>
              {teacher.verificationStatus === 'verified' && <StatusBadge status="verified" />}
              <StatusBadge status={teacher.active ? 'active' : 'inactive'} />
            </div>
            {teacher.bio && <p className="text-sm text-neutral-600 dark:text-neutral-400">{teacher.bio}</p>}
            {teacher.qualifications && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                <GraduationCap className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                {teacher.qualifications}
              </p>
            )}
            {teacher.languages && teacher.languages.length > 0 && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                <Languages className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                {teacher.languages.join(', ')}
              </p>
            )}
            {teacher.yearsExperience != null && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{teacher.yearsExperience} years experience</p>
            )}
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              Joined your academy {new Date(teacher.joinedAt).toLocaleDateString()}
            </p>
            <a
              href={`/t/${teacher.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-xs font-medium text-brand-600 hover:underline dark:text-brand-300"
            >
              View public profile
            </a>
          </div>
        </AcademyCard>
      </section>

      {teacher.subjects.length > 0 && (
        <section>
          <AcademySectionHeader title="Subjects" />
          <div className="flex flex-wrap gap-2">
            {teacher.subjects.map((s) => (
              <span
                key={s.subjectId}
                className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
              >
                {s.name} · Grades {s.gradeMin}–{s.gradeMax}
              </span>
            ))}
          </div>
        </section>
      )}

      <section>
        <AcademySectionHeader title="Batches" />
        {teacher.batches.length === 0 ? (
          <EmptyState icon={BookOpen} title="No batches yet" description="Batches this teacher runs at your academy will appear here." />
        ) : (
          <AcademyCard className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
            {teacher.batches.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{b.title}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">{b.enrolledCount} students</p>
                </div>
                <StatusBadge status={b.status} />
              </div>
            ))}
          </AcademyCard>
        )}
      </section>

      <section>
        <AcademySectionHeader title="Upcoming classes" />
        {teacher.upcomingClasses.length === 0 ? (
          <EmptyState icon={CalendarClock} title="Nothing scheduled" description="Upcoming classes for this teacher will appear here." />
        ) : (
          <AcademyCard className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
            {teacher.upcomingClasses.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{s.batchTitle}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {new Date(s.scheduledStartUtc).toLocaleString('en-IN', {
                      timeZone: s.timezone,
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}{' '}
                    · {s.durationMin} min
                  </p>
                </div>
                <StatusBadge status={s.status} />
              </div>
            ))}
          </AcademyCard>
        )}
      </section>

      <section>
        <AcademySectionHeader title="Leave history at your academy" />
        {teacher.leaveHistory.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">No leave requests filed yet.</p>
        ) : (
          <AcademyCard className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
            {teacher.leaveHistory.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <CalendarOff className="h-4 w-4 text-neutral-400" aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      {l.startDate === l.endDate ? l.startDate : `${l.startDate} – ${l.endDate}`}
                    </p>
                    {l.reason && <p className="text-xs text-neutral-500 dark:text-neutral-400">{l.reason}</p>}
                  </div>
                </div>
                <StatusBadge status={l.status} />
              </div>
            ))}
          </AcademyCard>
        )}
      </section>
    </div>
  );
}
