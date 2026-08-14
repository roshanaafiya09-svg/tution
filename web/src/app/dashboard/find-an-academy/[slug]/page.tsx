'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Award, Clock, MapPin, Send, Star, Users } from 'lucide-react';
import { api, ApiError, formatMinor } from '@/lib/api';
import type { PublicAcademyPage, TutorJoinRequestSummary } from '@/lib/types';
import { academyInitials } from '@/lib/academies';
import { tutorInitials } from '@/lib/discovery';
import {
  Button,
  CardSkeleton,
  ErrorState,
  StatusBadge,
  Textarea,
  useToast,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogFooter,
} from '@/components/ui';
import { AcademicCard, TeacherPageHeader } from '@/components/dashboard';

export default function TeacherAcademyProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const toast = useToast();
  const [page, setPage] = useState<PublicAcademyPage | null>(null);
  const [ownRequest, setOwnRequest] = useState<TutorJoinRequestSummary | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    setNotFound(false);
    Promise.all([
      api.get<PublicAcademyPage>(`/marketplace/academies/${slug}`),
      api.get<TutorJoinRequestSummary[]>('/marketplace/academies/me/join-requests'),
      api.get<{ id: string; slug: string }[]>('/marketplace/academies/me/memberships'),
    ])
      .then(([pageRes, requests, memberships]) => {
        setPage(pageRes);
        setIsMember(memberships.some((m) => m.slug === slug));
        const latest = requests
          .filter((r) => r.academy_slug === slug)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
        setOwnRequest(latest ?? null);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setLoadError(true);
      });
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  async function sendJoinRequest() {
    setSending(true);
    try {
      await api.post(`/marketplace/academies/${slug}/join-requests`, { message: message || undefined });
      toast({ title: 'Request sent successfully.', variant: 'success' });
      setMessage('');
      setDialogOpen(false);
      load();
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : 'Could not send your request',
        variant: 'error',
      });
    } finally {
      setSending(false);
    }
  }

  if (loadError) {
    return (
      <ErrorState description="Could not load this academy's profile. Check your connection and try again." onRetry={load} />
    );
  }

  if (notFound) {
    return <ErrorState description="This academy profile could not be found." />;
  }

  if (page === null) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const { academy, location, teachers, photos, offerings, availableBatches, studentsCount, reviews } = page;

  return (
    <div>
      <TeacherPageHeader
        eyebrow="Find an Academy"
        title={academy.name}
        back={{ href: '/dashboard/find-an-academy', label: 'Find an Academy' }}
      />

      <div className="mt-8">
        {academy.coverUrl && (
          <div className="mb-4 h-40 w-full overflow-hidden rounded-2xl sm:h-56">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={academy.coverUrl} alt="" className="h-full w-full object-cover" />
          </div>
        )}

        <AcademicCard className="mb-6">
          <div className="flex flex-wrap items-start gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 font-display text-xl font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              {academy.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={academy.logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                academyInitials(academy.name)
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-display text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{academy.name}</p>
                {academy.verificationStatus === 'verified' && <StatusBadge status="verified" />}
              </div>
              {academy.tagline && <p className="mt-1 text-neutral-600 dark:text-neutral-400">{academy.tagline}</p>}
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-500 dark:text-neutral-500">
                {location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    {location.areaLabel ? `${location.areaLabel}, ` : ''}
                    {location.city}
                  </span>
                )}
                {academy.teachingMode && <span className="capitalize">{academy.teachingMode}</span>}
                {reviews.summary.average !== null && (
                  <span className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-accent-400 text-accent-400" aria-hidden />
                    {reviews.summary.average} ({reviews.summary.count})
                  </span>
                )}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              {isMember ? (
                <Button variant="secondary" disabled>
                  Active Member
                </Button>
              ) : ownRequest?.status === 'pending' ? (
                <Button variant="secondary" disabled>
                  Request Pending
                </Button>
              ) : (
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Send className="h-4 w-4" aria-hidden />
                      Request to Join Academy
                    </Button>
                  </DialogTrigger>
                  <DialogContent
                    title={`Request to join ${academy.name}?`}
                    description="You will remain an individual teacher while becoming a member of this academy."
                  >
                    <Textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Message to Academy (optional)"
                      rows={4}
                    />
                    <DialogFooter>
                      <Button onClick={() => void sendJoinRequest()} disabled={sending} loading={sending}>
                        {sending ? 'Sending…' : 'Send Request'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          {ownRequest?.status === 'rejected' && (
            <p className="mt-4 rounded-md bg-neutral-50 p-3 text-sm text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
              Your request to join {academy.name} was declined. You can request again below.
            </p>
          )}

          {academy.description && (
            <p className="mt-6 whitespace-pre-line leading-relaxed text-neutral-700 dark:text-neutral-300">{academy.description}</p>
          )}
        </AcademicCard>

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <AcademicCard className="flex items-start gap-3">
            <Award className="mt-0.5 h-5 w-5 text-brand-500 dark:text-brand-300" aria-hidden />
            <div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Teachers</p>
              <p className="mt-0.5 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{teachers.length}</p>
            </div>
          </AcademicCard>
          <AcademicCard className="flex items-start gap-3">
            <Users className="mt-0.5 h-5 w-5 text-brand-500 dark:text-brand-300" aria-hidden />
            <div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Students taught</p>
              <p className="mt-0.5 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{studentsCount ?? '—'}</p>
            </div>
          </AcademicCard>
          <AcademicCard className="flex items-start gap-3">
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
          </AcademicCard>
        </div>

        {[
          ['Teaching methodology', academy.methodology],
          ['Achievements', academy.achievements],
          ['Certifications', academy.certifications],
        ]
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">{label}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-neutral-700 dark:text-neutral-300">{value}</p>
            </div>
          ))}

        {academy.yearsEstablished && (
          <p className="mb-4 text-sm text-neutral-700 dark:text-neutral-300">
            <span className="font-medium">Established: </span>
            {academy.yearsEstablished}
          </p>
        )}

        {photos.length > 0 && (
          <>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-neutral-900 dark:text-neutral-50">Photos</h2>
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((p) => (
                <div key={p.id} className="aspect-video overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.caption ?? ''} className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          </>
        )}

        <h2 className="mb-3 mt-8 text-lg font-semibold text-neutral-900 dark:text-neutral-50">Subjects & classes</h2>
        {offerings.length === 0 ? (
          <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">No subjects listed yet.</p>
        ) : (
          <AcademicCard className="mb-6 divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
            {offerings.map((o) => (
              <div key={o.tutorSubjectId} className="flex items-center justify-between px-6 py-3">
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{o.subjectName.en}</p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Grades {o.gradeMin}–{o.gradeMax} · via {o.tutorDisplayName ?? 'a teacher'}
                  </p>
                </div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{formatMinor(o.hourlyRateMinor, 'INR')}/hr</p>
              </div>
            ))}
          </AcademicCard>
        )}

        <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">Our Teachers</h2>
        {teachers.length === 0 ? (
          <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">No teachers listed yet.</p>
        ) : (
          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            {teachers.map((t) => (
              <AcademicCard key={t.tutorId} className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                  {t.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    tutorInitials(t.displayName)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{t.displayName ?? 'Teacher'}</p>
                    {t.verificationStatus === 'verified' && <StatusBadge status="verified" />}
                  </div>
                  {t.headline && <p className="text-xs text-neutral-500 dark:text-neutral-400">{t.headline}</p>}
                  {t.yearsExperience != null && (
                    <p className="text-xs text-neutral-400 dark:text-neutral-500">{t.yearsExperience} years experience</p>
                  )}
                  <a
                    href={`/t/${t.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 inline-block text-xs font-medium text-brand-600 hover:underline dark:text-brand-300"
                  >
                    View Teacher Profile
                  </a>
                </div>
              </AcademicCard>
            ))}
          </div>
        )}

        <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">Academy batches</h2>
        {availableBatches.length === 0 ? (
          <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">No open batches right now.</p>
        ) : (
          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            {availableBatches.map((b) => (
              <AcademicCard key={b.id} className="flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0 text-brand-500 dark:text-brand-300" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{b.title}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {formatMinor(b.feeMinor, b.currency)}/{b.feePeriod.replace('_', ' ')} · {b.seatsRemaining} seats left
                    {b.tutorDisplayName ? ` · with ${b.tutorDisplayName}` : ''}
                  </p>
                </div>
              </AcademicCard>
            ))}
          </div>
        )}

        <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">Academy reviews</h2>
        {reviews.reviews.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">No reviews yet.</p>
        ) : (
          <div className="space-y-3">
            {reviews.reviews.map((review) => (
              <AcademicCard key={review.id}>
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
              </AcademicCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
