'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Award, Clock, MapPin, MessageCircle, Star, Users } from 'lucide-react';
import { api, ApiError, formatMinor } from '@/lib/api';
import type { PublicTutorPage } from '@/lib/types';
import { tutorInitials } from '@/lib/discovery';
import {
  Button,
  CardSkeleton,
  ErrorState,
  PageHeader,
  StatusBadge,
  Textarea,
  useToast,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogFooter,
} from '@/components/ui';
import { ParentCard } from '@/components/parent';

export default function ParentTutorProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const toast = useToast();
  const [page, setPage] = useState<PublicTutorPage | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    setNotFound(false);
    api
      .get<PublicTutorPage>(`/marketplace/discovery/tutors/${slug}`)
      .then(setPage)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setLoadError(true);
      });
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  async function sendContactRequest() {
    setSending(true);
    try {
      await api.post(`/marketplace/discovery/tutors/${slug}/contact`, { message: message || undefined });
      toast({ title: 'Message sent', description: 'The teacher has been notified.', variant: 'success' });
      setMessage('');
      setDialogOpen(false);
    } catch {
      toast({ title: 'Could not send your message', variant: 'error' });
    } finally {
      setSending(false);
    }
  }

  if (loadError) {
    return (
      <ErrorState description="Could not load this teacher's profile. Check your connection and try again." onRetry={load} />
    );
  }

  if (notFound) {
    return <ErrorState description="This teacher profile could not be found." />;
  }

  if (page === null) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const { profile, location, offerings, availableBatches, proofOfTeaching, reviews } = page;

  return (
    <div>
      <PageHeader
        title={profile.displayName ?? 'Teacher'}
        back={{ href: '/parent/find-a-teacher', label: 'Find a Teacher' }}
      />

      <ParentCard className="mb-6">
        <div className="flex flex-wrap items-start gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 font-display text-xl font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              tutorInitials(profile.displayName)
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
                {profile.displayName ?? 'Teacher'}
              </p>
              {profile.verificationStatus === 'verified' && <StatusBadge status="verified" />}
            </div>
            {profile.headline && <p className="mt-1 text-neutral-600 dark:text-neutral-400">{profile.headline}</p>}
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-500 dark:text-neutral-500">
              {location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                  {location.areaLabel ? `${location.areaLabel}, ` : ''}
                  {location.city}
                </span>
              )}
              {profile.teachingMode && <span className="capitalize">{profile.teachingMode}</span>}
              {profile.languages.length > 0 && <span>{profile.languages.join(', ')}</span>}
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="shrink-0">
                <MessageCircle className="h-4 w-4" aria-hidden />
                Contact Teacher
              </Button>
            </DialogTrigger>
            <DialogContent title="Contact Teacher" description={`Send ${profile.displayName ?? 'this teacher'} a short message.`}>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="I'm interested in lessons for my child..."
                rows={4}
              />
              <DialogFooter>
                <Button onClick={() => void sendContactRequest()} disabled={sending} loading={sending}>
                  {sending ? 'Sending…' : 'Send message'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {profile.bio && <p className="mt-6 whitespace-pre-line leading-relaxed text-neutral-700 dark:text-neutral-300">{profile.bio}</p>}
      </ParentCard>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <ParentCard className="flex items-start gap-3">
          <Award className="mt-0.5 h-5 w-5 text-brand-500 dark:text-brand-300" aria-hidden />
          <div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Proof-of-Teaching</p>
            <p className="mt-0.5 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{proofOfTeaching.score}</p>
          </div>
        </ParentCard>
        <ParentCard className="flex items-start gap-3">
          <Users className="mt-0.5 h-5 w-5 text-brand-500 dark:text-brand-300" aria-hidden />
          <div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Students taught</p>
            <p className="mt-0.5 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{proofOfTeaching.studentsTaught}</p>
          </div>
        </ParentCard>
        <ParentCard className="flex items-start gap-3">
          <Star className="mt-0.5 h-5 w-5 fill-accent-400 text-accent-400" aria-hidden />
          <div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Rating</p>
            <p className="mt-0.5 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
              {reviews.summary.average ?? '—'}
              {reviews.summary.average !== null && (
                <span className="text-sm font-normal text-neutral-500 dark:text-neutral-400"> ({reviews.summary.count})</span>
              )}
            </p>
          </div>
        </ParentCard>
      </div>

      {[
        ['Educational qualifications', profile.qualifications],
        ['Teaching methodology', profile.methodology],
        ['Achievements', profile.achievements],
        ['Certifications', profile.certifications],
      ]
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <div key={label} className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">{label}</p>
            <p className="mt-1 whitespace-pre-line text-sm text-neutral-700 dark:text-neutral-300">{value}</p>
          </div>
        ))}

      {profile.feeNote && (
        <p className="mb-4 text-sm text-neutral-700 dark:text-neutral-300">
          <span className="font-medium">Fee: </span>
          {profile.feeNote}
        </p>
      )}

      <h2 className="mb-3 mt-8 text-lg font-semibold text-neutral-900 dark:text-neutral-50">Subjects & rates</h2>
      {offerings.length === 0 ? (
        <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">No subjects listed yet.</p>
      ) : (
        <ParentCard className="mb-6 divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
          {offerings.map((o) => (
            <div key={o.tutorSubjectId} className="flex items-center justify-between px-6 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{o.subjectName.en}</p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">Grades {o.gradeMin}–{o.gradeMax}</p>
              </div>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{formatMinor(o.hourlyRateMinor, 'INR')}/hr</p>
            </div>
          ))}
        </ParentCard>
      )}

      <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">Available batches</h2>
      {availableBatches.length === 0 ? (
        <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">No open batches right now.</p>
      ) : (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {availableBatches.map((b) => (
            <ParentCard key={b.id} className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-brand-500 dark:text-brand-300" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{b.title}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {formatMinor(b.feeMinor, b.currency)}/{b.feePeriod.replace('_', ' ')} · {b.seatsRemaining} seats left
                </p>
              </div>
            </ParentCard>
          ))}
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">Reviews</h2>
      {reviews.reviews.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">No reviews yet.</p>
      ) : (
        <div className="space-y-3">
          {reviews.reviews.map((review) => (
            <ParentCard key={review.id}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                  {review.student_display_name ?? 'Student'}
                </p>
                <p className="flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-300">
                  <Star className="h-3.5 w-3.5 fill-accent-400 text-accent-400" aria-hidden />
                  {review.rating}
                </p>
              </div>
              {review.comment && <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{review.comment}</p>}
            </ParentCard>
          ))}
        </div>
      )}
    </div>
  );
}
