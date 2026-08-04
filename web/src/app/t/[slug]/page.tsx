import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatMinor } from '@/lib/api';
import type { PublicTutorPage } from '@/lib/types';
import { Card, StatusBadge } from '@/components/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function getTutorPage(slug: string): Promise<PublicTutorPage | null> {
  const res = await fetch(`${API_URL}/marketplace/discovery/tutors/${slug}`, {
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Could not load this tutor profile.');
  return (await res.json()) as PublicTutorPage;
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const page = await getTutorPage(params.slug);
  if (!page) return { title: 'Tutor not found — Scholar' };
  return {
    title: `${page.profile.displayName ?? 'Tutor'}${page.profile.headline ? ` — ${page.profile.headline}` : ''} | Scholar`,
    description: page.profile.bio ?? `${page.profile.displayName ?? 'This tutor'} on Scholar.`,
  };
}

export default async function TutorProfilePage({ params }: { params: { slug: string } }) {
  const page = await getTutorPage(params.slug);
  if (!page) notFound();

  const { profile, location, offerings, proofOfTeaching, reviews } = page;

  return (
    <main className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
          <Link href="/" className="font-display text-xl font-semibold italic text-brand-800">
            Scholar
          </Link>
          <Link href="/discover" className="text-sm font-medium text-neutral-600 hover:text-neutral-900">
            Find a tutor
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold text-neutral-900">
              {profile.displayName ?? 'Tutor'}
            </h1>
            {profile.headline && <p className="mt-1 text-neutral-600">{profile.headline}</p>}
            {location && (
              <p className="mt-1 text-sm text-neutral-500">
                {location.areaLabel ? `${location.areaLabel}, ` : ''}
                {location.city}
              </p>
            )}
          </div>
          {profile.verificationStatus === 'verified' && <StatusBadge status="verified" />}
        </div>

        {profile.bio && <p className="mt-6 text-neutral-700">{profile.bio}</p>}

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-sm text-neutral-500">Proof-of-Teaching score</p>
            <p className="mt-1 text-2xl font-semibold text-neutral-900">{proofOfTeaching.score}</p>
          </Card>
          <Card>
            <p className="text-sm text-neutral-500">Verified hours taught</p>
            <p className="mt-1 text-2xl font-semibold text-neutral-900">
              {proofOfTeaching.inputs.verifiedHours}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-neutral-500">Rating</p>
            <p className="mt-1 text-2xl font-semibold text-neutral-900">
              {reviews.summary.average ?? '—'}
              {reviews.summary.average !== null && (
                <span className="text-sm font-normal text-neutral-500"> ({reviews.summary.count})</span>
              )}
            </p>
          </Card>
        </div>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-neutral-900">Subjects & rates</h2>
        {offerings.length === 0 ? (
          <p className="text-sm text-neutral-500">No subjects listed yet.</p>
        ) : (
          <Card className="mb-8 divide-y divide-neutral-100 p-0">
            {offerings.map((o) => (
              <div key={o.tutorSubjectId} className="flex items-center justify-between px-6 py-3">
                <div>
                  <p className="text-sm font-medium text-neutral-900">{o.subjectName.en}</p>
                  <p className="text-sm text-neutral-500">Grades {o.gradeMin}–{o.gradeMax}</p>
                </div>
                <p className="text-sm font-medium text-neutral-900">
                  {formatMinor(o.hourlyRateMinor, 'INR')}/hr
                </p>
              </div>
            ))}
          </Card>
        )}

        {offerings.length > 0 && (
          <Link
            href={`/book/${profile.slug}`}
            className="mb-8 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Book a session
          </Link>
        )}

        <h2 className="mb-3 mt-4 text-lg font-semibold text-neutral-900">Reviews</h2>
        {reviews.reviews.length === 0 ? (
          <p className="text-sm text-neutral-500">No reviews yet.</p>
        ) : (
          <div className="space-y-3">
            {reviews.reviews.map((review) => (
              <Card key={review.id}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-neutral-900">
                    {review.student_display_name ?? 'Student'}
                  </p>
                  <p className="text-sm text-neutral-600">★ {review.rating}</p>
                </div>
                {review.comment && <p className="mt-2 text-sm text-neutral-600">{review.comment}</p>}
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
