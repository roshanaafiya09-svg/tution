'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Star, Info, Search, SearchX, SlidersHorizontal } from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import type { Curriculum, DiscoverySearchResponse, Subject } from '@/lib/types';
import { buildTutorSearchParams, tutorInitials } from '@/lib/discovery';
import { CardSkeleton, ErrorState, EmptyState, Field, Input, Select } from '@/components/ui';
import { AcademicCard, PageIntro, SectionHeader } from '@/components/student';

export default function StudentFindATeacherPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [query, setQuery] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [curriculumId, setCurriculumId] = useState('');
  const [grade, setGrade] = useState('');
  const [language, setLanguage] = useState('');
  const [teachingMode, setTeachingMode] = useState('');
  const [minExperience, setMinExperience] = useState('');
  const [feeMaxMinor, setFeeMaxMinor] = useState('');
  const [minRating, setMinRating] = useState('');
  const [results, setResults] = useState<DiscoverySearchResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    void api.get<Subject[]>('/catalog/subjects').then(setSubjects);
    void api.get<Curriculum[]>('/catalog/curricula').then(setCurricula);
  }, []);

  useEffect(() => {
    setLoadError(false);
    setResults(null);
    const params = buildTutorSearchParams({
      subjectId,
      curriculumId,
      grade,
      language,
      teachingMode: teachingMode as '' | 'online' | 'offline' | 'both',
      minExperience,
      feeMaxMinor,
      minRating,
    });
    void api
      .get<DiscoverySearchResponse>(`/marketplace/discovery/tutors?${params.toString()}`)
      .then(setResults)
      .catch(() => setLoadError(true));
  }, [subjectId, curriculumId, grade, language, teachingMode, minExperience, feeMaxMinor, minRating, retryCount]);

  const filtered =
    results && query.trim()
      ? {
          ...results,
          results: results.results.filter((t) => {
            const needle = query.trim().toLowerCase();
            return (
              t.displayName?.toLowerCase().includes(needle) ||
              t.offerings.some((o) => o.subjectName.en.toLowerCase().includes(needle))
            );
          }),
        }
      : results;

  return (
    <div>
      <PageIntro
        eyebrow="Learning"
        title="Find a Teacher"
        description="Search verified teachers by subject, class, location, and more."
      />

      <div className="mt-8">
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teachers by name, subject, class…"
            className="pl-9"
          />
        </div>

        <AcademicCard className="mb-6">
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
            <Field label="Language">
              <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="e.g. Tamil" />
            </Field>
            <Field label="Min. experience (years)">
              <Input
                type="number"
                min={0}
                value={minExperience}
                onChange={(e) => setMinExperience(e.target.value)}
              />
            </Field>
            <Field label="Max fee (₹/hr)">
              <Input
                type="number"
                min={0}
                value={feeMaxMinor ? String(Number(feeMaxMinor) / 100) : ''}
                onChange={(e) => setFeeMaxMinor(e.target.value ? String(Number(e.target.value) * 100) : '')}
              />
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
        </AcademicCard>

        {results?.curated && (
          <AcademicCard className="mb-6 flex items-start gap-3 border-info/20 bg-info-bg dark:border-info/25 dark:bg-info/10">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-info dark:text-info-dark" aria-hidden />
            <p className="text-sm text-info dark:text-info-dark">
              We&apos;re still growing in this area — here&apos;s a curated list of teachers rather than a
              filtered search. Full search opens up once there are more teachers and students nearby.
            </p>
          </AcademicCard>
        )}

        <SectionHeader title="Teachers" />

        {loadError ? (
          <ErrorState
            description="Could not load teachers. Check your connection and try again."
            onRetry={() => setRetryCount((n) => n + 1)}
          />
        ) : filtered === null ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : filtered.results.length === 0 ? (
          <EmptyState icon={SearchX} title="No teachers found" description="Try different filters or a broader search." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {filtered.results.map((tutor) => (
              <Link key={tutor.tutorId} href={`/student/find-a-teacher/${tutor.slug}`}>
                <AcademicCard interactive className="h-full">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                      {tutor.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={tutor.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        tutorInitials(tutor.displayName)
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-neutral-900 dark:text-neutral-50">
                          {tutor.displayName ?? 'Teacher'}
                        </p>
                        {tutor.rating.average !== null && (
                          <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                            <Star className="h-3.5 w-3.5 fill-accent-400 text-accent-400" aria-hidden />
                            {tutor.rating.average} ({tutor.rating.count})
                          </span>
                        )}
                      </div>
                      {tutor.headline && (
                        <p className="text-sm text-neutral-500 dark:text-neutral-400">{tutor.headline}</p>
                      )}
                      <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                        {[tutor.teachingMode, tutor.location?.city].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {tutor.offerings.slice(0, 3).map((o) => (
                      <span
                        key={o.tutorSubjectId}
                        className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                      >
                        {o.subjectName.en} · {formatMinor(o.hourlyRateMinor, 'INR')}/hr
                      </span>
                    ))}
                  </div>
                </AcademicCard>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
