'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, formatMinor } from '@/lib/api';
import type { Curriculum, DiscoverySearchResponse, Subject } from '@/lib/types';
import { Card, EmptyState, Field, inputClass } from '@/components/ui';

export default function DiscoverPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [curriculumId, setCurriculumId] = useState('');
  const [grade, setGrade] = useState('');
  const [results, setResults] = useState<DiscoverySearchResponse | null>(null);

  useEffect(() => {
    void api.get<Subject[]>('/catalog/subjects').then(setSubjects);
    void api.get<Curriculum[]>('/catalog/curricula').then(setCurricula);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (subjectId) params.set('subjectId', subjectId);
    if (curriculumId) params.set('curriculumId', curriculumId);
    if (grade) params.set('grade', grade);
    void api
      .get<DiscoverySearchResponse>(`/marketplace/discovery/tutors?${params.toString()}`)
      .then(setResults);
  }, [subjectId, curriculumId, grade]);

  return (
    <main className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="font-display text-xl font-semibold italic text-brand-800">
            Scholar
          </Link>
          <Link href="/login" className="text-sm font-medium text-neutral-600 hover:text-neutral-900">
            Sign in
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="font-display text-3xl font-semibold text-neutral-900">Find a tutor</h1>
        <p className="mt-1 text-sm text-neutral-500">Verified tutors, ranked by proven teaching quality.</p>

        <Card className="mt-6 mb-8">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Subject">
              <select className={inputClass} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                <option value="">Any subject</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name_i18n.en}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Curriculum">
              <select
                className={inputClass}
                value={curriculumId}
                onChange={(e) => setCurriculumId(e.target.value)}
              >
                <option value="">Any curriculum</option>
                {curricula.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Grade">
              <select className={inputClass} value={grade} onChange={(e) => setGrade(e.target.value)}>
                <option value="">Any grade</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
                  <option key={g} value={g}>
                    Grade {g}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        {results?.curated && (
          <Card className="mb-6 border-info/20 bg-info-bg">
            <p className="text-sm text-info">
              We&apos;re still growing in your area — here&apos;s a curated list of tutors rather than a
              filtered search. Full search opens up once there are more tutors and students nearby.
            </p>
          </Card>
        )}

        {results === null ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : results.results.length === 0 ? (
          <EmptyState title="No tutors found" description="Try a different subject or grade." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {results.results.map((tutor) => (
              <Link key={tutor.tutorId} href={`/t/${tutor.slug}`}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-neutral-900">{tutor.displayName ?? 'Tutor'}</p>
                      {tutor.headline && <p className="text-sm text-neutral-500">{tutor.headline}</p>}
                    </div>
                    {tutor.rating.average !== null && (
                      <span className="text-sm font-medium text-neutral-700">
                        ★ {tutor.rating.average} ({tutor.rating.count})
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {tutor.offerings.slice(0, 3).map((o) => (
                      <span
                        key={o.tutorSubjectId}
                        className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600"
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
