'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Star, Info, Search, SearchX, SlidersHorizontal, Users, GraduationCap } from 'lucide-react';
import { api } from '@/lib/api';
import type { AcademySearchResponse, Curriculum, Subject } from '@/lib/types';
import { buildAcademySearchParams, academyInitials } from '@/lib/academies';
import { CardSkeleton, ErrorState, EmptyState, Field, Input, PageHeader, Select, StatusBadge } from '@/components/ui';
import { ParentCard, ParentSectionHeader } from '@/components/parent';

export default function ParentFindAnAcademyPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [query, setQuery] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [curriculumId, setCurriculumId] = useState('');
  const [grade, setGrade] = useState('');
  const [teachingMode, setTeachingMode] = useState('');
  const [minRating, setMinRating] = useState('');
  const [results, setResults] = useState<AcademySearchResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    void api.get<Subject[]>('/catalog/subjects').then(setSubjects);
    void api.get<Curriculum[]>('/catalog/curricula').then(setCurricula);
  }, []);

  useEffect(() => {
    setLoadError(false);
    setResults(null);
    const params = buildAcademySearchParams({
      subjectId,
      curriculumId,
      grade,
      teachingMode: teachingMode as '' | 'online' | 'offline' | 'both',
      minRating,
    });
    void api
      .get<AcademySearchResponse>(`/marketplace/academies?${params.toString()}`)
      .then(setResults)
      .catch(() => setLoadError(true));
  }, [subjectId, curriculumId, grade, teachingMode, minRating, retryCount]);

  const filtered =
    results && query.trim()
      ? {
          ...results,
          results: results.results.filter((a) => {
            const needle = query.trim().toLowerCase();
            return (
              a.name.toLowerCase().includes(needle) ||
              a.location?.city.toLowerCase().includes(needle) ||
              a.subjects.some((s) => s.toLowerCase().includes(needle))
            );
          }),
        }
      : results;

  return (
    <div>
      <PageHeader
        title="Find an Academy"
        description="Search verified academies by name, subject, location, and more."
      />

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search academies by name, subject, or location…"
          className="pl-9"
        />
      </div>

      <ParentCard className="mb-6">
        <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          Filters
        </div>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Field label="Subject">
            <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Any subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name_i18n.en}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Curriculum">
            <Select value={curriculumId} onChange={(e) => setCurriculumId(e.target.value)}>
              <option value="">Any curriculum</option>
              {curricula.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Grade">
            <Select value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">Any grade</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
                <option key={g} value={g}>
                  Grade {g}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Teaching mode">
            <Select value={teachingMode} onChange={(e) => setTeachingMode(e.target.value)}>
              <option value="">Any</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="both">Both</option>
            </Select>
          </Field>
          <Field label="Min. rating">
            <Select value={minRating} onChange={(e) => setMinRating(e.target.value)}>
              <option value="">Any rating</option>
              {[3, 4, 4.5].map((r) => (
                <option key={r} value={r}>
                  {r}+ stars
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </ParentCard>

      {results?.curated && (
        <ParentCard className="mb-6 flex items-start gap-3 border-info/20 bg-info-bg dark:border-info/25 dark:bg-info/10">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info dark:text-info-dark" aria-hidden />
          <p className="text-sm text-info dark:text-info-dark">
            We&apos;re still growing in this area — here&apos;s a curated list of academies rather than a
            filtered search. Full search opens up once there are more academies nearby.
          </p>
        </ParentCard>
      )}

      <ParentSectionHeader title="Academies" />

      {loadError ? (
        <ErrorState
          description="Could not load academies. Check your connection and try again."
          onRetry={() => setRetryCount((n) => n + 1)}
        />
      ) : filtered === null ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.results.length === 0 ? (
        <EmptyState icon={SearchX} title="No academies found" description="Try different filters or a broader search." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.results.map((academy) => (
            <Link key={academy.academyId} href={`/parent/find-an-academy/${academy.slug}`}>
              <ParentCard interactive className="h-full">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                    {academy.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={academy.logoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      academyInitials(academy.name)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-neutral-900 dark:text-neutral-50">{academy.name}</p>
                        {academy.verificationStatus === 'verified' && <StatusBadge status="verified" />}
                      </div>
                      {academy.rating.average !== null && (
                        <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                          <Star className="h-3.5 w-3.5 fill-accent-400 text-accent-400" aria-hidden />
                          {academy.rating.average} ({academy.rating.count})
                        </span>
                      )}
                    </div>
                    {academy.tagline && (
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">{academy.tagline}</p>
                    )}
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400 dark:text-neutral-500">
                      {[academy.teachingMode, academy.location?.city].filter(Boolean).join(' · ')}
                      <span className="flex items-center gap-1">
                        <GraduationCap className="h-3 w-3" aria-hidden />
                        {academy.teacherCount} {academy.teacherCount === 1 ? 'teacher' : 'teachers'}
                      </span>
                      {academy.studentsCount !== null && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" aria-hidden />
                          {academy.studentsCount} students
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {academy.subjects.slice(0, 4).map((s) => (
                    <span
                      key={s}
                      className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </ParentCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
