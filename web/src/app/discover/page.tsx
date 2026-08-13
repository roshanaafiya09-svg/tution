'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Star, Info, SearchX, SlidersHorizontal } from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import type { Curriculum, DiscoverySearchResponse, Subject } from '@/lib/types';
import { buildTutorSearchParams, tutorInitials as initials } from '@/lib/discovery';
import { Card, EmptyState, ErrorState, Field, Select, CardSkeleton } from '@/components/ui';

export default function DiscoverPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [curriculumId, setCurriculumId] = useState('');
  const [grade, setGrade] = useState('');
  const [results, setResults] = useState<DiscoverySearchResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    void api.get<Subject[]>('/catalog/subjects').then(setSubjects);
    void api.get<Curriculum[]>('/catalog/curricula').then(setCurricula);
  }, []);

  useEffect(() => {
    setLoadError(false);
    const params = buildTutorSearchParams({ subjectId, curriculumId, grade });
    void api
      .get<DiscoverySearchResponse>(`/marketplace/discovery/tutors?${params.toString()}`)
      .then(setResults)
      .catch(() => setLoadError(true));
  }, [subjectId, curriculumId, grade, retryCount]);

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:border-neutral-800 dark:bg-neutral-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link
            href="/"
            className="font-display text-xl font-semibold italic text-brand-800 dark:text-brand-200"
          >
            Scholar
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            Sign in
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="font-display text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
          Find a tutor
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Verified tutors, ranked by proven teaching quality.
        </p>

        <Card className="mt-6 mb-8">
          <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            Filters
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
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
          </div>
        </Card>

        {results?.curated && (
          <Card className="mb-6 flex items-start gap-3 border-info/20 bg-info-bg dark:border-info/25 dark:bg-info/10">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-info dark:text-info-dark" aria-hidden />
            <p className="text-sm text-info dark:text-info-dark">
              We&apos;re still growing in your area — here&apos;s a curated list of tutors rather than a
              filtered search. Full search opens up once there are more tutors and students nearby.
            </p>
          </Card>
        )}

        {loadError ? (
          <ErrorState
            description="Could not load tutors. Check your connection and try again."
            onRetry={() => setRetryCount((n) => n + 1)}
          />
        ) : results === null ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : results.results.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No tutors found"
            description="Try a different subject or grade."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {results.results.map((tutor) => (
              <Link key={tutor.tutorId} href={`/t/${tutor.slug}`}>
                <Card interactive className="h-full">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                      {initials(tutor.displayName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-neutral-900 dark:text-neutral-50">
                          {tutor.displayName ?? 'Tutor'}
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
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
