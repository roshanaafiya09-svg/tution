import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MapPin, Award, Clock, Star, ArrowRight } from 'lucide-react';
import { formatMinor } from '@/lib/api';
import type { PublicTutorPage } from '@/lib/types';
import { Card, StatusBadge, buttonVariants } from '@/components/ui';
import { cn } from '@/lib/cn';

function getApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      'NEXT_PUBLIC_API_URL is not set. Configure it in your environment (see web/.env.example) or in the Vercel project settings.',
    );
  }
  return url;
}

async function getTutorPage(slug: string): Promise<PublicTutorPage | null> {
  const res = await fetch(`${getApiUrl()}/marketplace/discovery/tutors/${slug}`, {
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Could not load this tutor profile.');
  return (await res.json()) as PublicTutorPage;
}

function initials(name: string | null) {
  if (!name) return 'T';
  return name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
}

type PageParams = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: PageParams;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getTutorPage(slug);
  if (!page) return { title: 'Tutor not found — Scholar' };
  return {
    title: `${page.profile.displayName ?? 'Tutor'}${page.profile.headline ? ` — ${page.profile.headline}` : ''} | Scholar`,
    description: page.profile.bio ?? `${page.profile.displayName ?? 'This tutor'} on Scholar.`,
  };
}

export default async function TutorProfilePage({ params }: { params: PageParams }) {
  const { slug } = await params;
  const page = await getTutorPage(slug);
  if (!page) notFound();

  const { profile, location, offerings, proofOfTeaching, reviews } = page;

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:border-neutral-800 dark:bg-neutral-950/80">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
          <Link
            href="/"
            className="font-display text-xl font-semibold italic text-brand-800 dark:text-brand-200"
          >
            Scholar
          </Link>
          <Link
            href="/discover"
            className="text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            Find a tutor
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex flex-wrap items-start gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-50 font-display text-xl font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            {initials(profile.displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
                {profile.displayName ?? 'Tutor'}
              </h1>
              {profile.verificationStatus === 'verified' && <StatusBadge status="verified" />}
            </div>
            {profile.headline && (
              <p className="mt-1 text-neutral-600 dark:text-neutral-400">{profile.headline}</p>
            )}
            {location && (
              <p className="mt-1.5 flex items-center gap-1 text-sm text-neutral-500 dark:text-neutral-500">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                {location.areaLabel ? `${location.areaLabel}, ` : ''}
                {location.city}
              </p>
            )}
          </div>
        </div>

        {profile.bio && (
          <p className="mt-6 leading-relaxed text-neutral-700 dark:text-neutral-300">{profile.bio}</p>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Card className="flex items-start gap-3">
            <Award className="mt-0.5 h-5 w-5 text-brand-500 dark:text-brand-300" aria-hidden />
            <div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Proof-of-Teaching</p>
              <p className="mt-0.5 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
                {proofOfTeaching.score}
              </p>
            </div>
          </Card>
          <Card className="flex items-start gap-3">
            <Clock className="mt-0.5 h-5 w-5 text-brand-500 dark:text-brand-300" aria-hidden />
            <div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Verified hours</p>
              <p className="mt-0.5 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
                {proofOfTeaching.inputs.verifiedHours}
              </p>
            </div>
          </Card>
          <Card className="flex items-start gap-3">
            <Star className="mt-0.5 h-5 w-5 fill-accent-400 text-accent-400" aria-hidden />
            <div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Rating</p>
              <p className="mt-0.5 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
                {reviews.summary.average ?? '—'}
                {reviews.summary.average !== null && (
                  <span className="text-sm font-normal text-neutral-500 dark:text-neutral-400">
                    {' '}
                    ({reviews.summary.count})
                  </span>
                )}
              </p>
            </div>
          </Card>
        </div>

        <h2 className="mb-3 mt-10 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
          Subjects &amp; rates
        </h2>
        {offerings.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">No subjects listed yet.</p>
        ) : (
          <Card className="mb-6 divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
            {offerings.map((o) => (
              <div key={o.tutorSubjectId} className="flex items-center justify-between px-6 py-3">
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    {o.subjectName.en}
                  </p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Grades {o.gradeMin}–{o.gradeMax}
                  </p>
                </div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                  {formatMinor(o.hourlyRateMinor, 'INR')}/hr
                </p>
              </div>
            ))}
          </Card>
        )}

        {offerings.length > 0 && (
          <Link
            href={`/book/${profile.slug}`}
            className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'mb-10')}
          >
            Book a session
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        )}

        <h2 className="mb-3 mt-4 text-lg font-semibold text-neutral-900 dark:text-neutral-50">Reviews</h2>
        {reviews.reviews.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">No reviews yet.</p>
        ) : (
          <div className="space-y-3">
            {reviews.reviews.map((review) => (
              <Card key={review.id}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    {review.student_display_name ?? 'Student'}
                  </p>
                  <p className="flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-300">
                    <Star className="h-3.5 w-3.5 fill-accent-400 text-accent-400" aria-hidden />
                    {review.rating}
                  </p>
                </div>
                {review.comment && (
                  <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{review.comment}</p>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
