'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Clock3 } from 'lucide-react';
import { api, formatMinor, ensureSession, ApiError } from '@/lib/api';
import { payForOrder } from '@/lib/razorpay';
import type { Booking, PaymentOrder, PublicTutorPage } from '@/lib/types';
import { Card, Button, Field, Input, Select, InlineError, PageLoading } from '@/components/ui';

function defaultStart(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16);
}

export default function BookSessionPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [tutorPage, setTutorPage] = useState<PublicTutorPage | null>(null);
  const [tutorSubjectId, setTutorSubjectId] = useState('');
  const [startLocal, setStartLocal] = useState(defaultStart());
  const [durationMin, setDurationMin] = useState('60');
  const [error, setError] = useState<string | null>(null);
  const [slotUnavailable, setSlotUnavailable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [joinedWaitlist, setJoinedWaitlist] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    api
      .get<PublicTutorPage>(`/marketplace/discovery/tutors/${slug}`)
      .then((page) => {
        setTutorPage(page);
        if (page.offerings.length > 0) setTutorSubjectId(page.offerings[0].tutorSubjectId);
      })
      .catch(() => setError('Could not load this tutor.'));
  }, [slug]);

  async function book() {
    if (!(await ensureSession())) {
      router.push(`/login?next=/book/${slug}`);
      return;
    }

    setError(null);
    setSlotUnavailable(false);
    setSubmitting(true);
    try {
      const booking = await api.post<Booking>('/marketplace/bookings', {
        tutorSubjectId,
        startLocal,
        durationMin: Number(durationMin),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      const order = await api.post<PaymentOrder>(`/payments/booking/${booking.id}/order`);
      await payForOrder(order, {
        name: 'Scholar 1:1 session',
        onSettled: () => setConfirmed(true),
        onError: (message) => setError(message),
      });
    } catch (err) {
      // Booking-domain conflicts (bad slot, double-booking, outside
      // availability) are 400s with a message meant to be user-facing —
      // that's the only case where "join waitlist" makes sense. Anything
      // else (403 wrong role, 401 expired session, 5xx) gets a generic
      // message instead of leaking the raw guard/exception text.
      if (err instanceof ApiError && err.status === 400) {
        setError(err.message);
        setSlotUnavailable(true);
      } else {
        setError('Could not book that slot. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function joinWaitlist() {
    if (!(await ensureSession())) {
      router.push(`/login?next=/book/${slug}`);
      return;
    }
    setError(null);
    try {
      await api.post('/marketplace/waitlists', { tutorSubjectId });
      setJoinedWaitlist(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not join the waitlist.');
    }
  }

  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-md">
        <Link
          href="/"
          className="mb-6 block text-center font-display text-2xl font-semibold italic text-brand-800 dark:text-brand-200"
        >
          Scholar
        </Link>

        <Card>
          {confirmed ? (
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success-bg dark:bg-success/15">
                <CheckCircle2 className="h-6 w-6 text-success dark:text-success-dark" aria-hidden />
              </div>
              <p className="font-display text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
                Booked
              </p>
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                Your session with {tutorPage?.profile.displayName ?? 'your tutor'} is confirmed.
              </p>
              <Link href="/bookings">
                <Button className="mt-6 w-full">View my bookings</Button>
              </Link>
            </div>
          ) : tutorPage === null ? (
            error ? (
              <InlineError>{error}</InlineError>
            ) : (
              <PageLoading label="Loading…" />
            )
          ) : tutorPage.offerings.length === 0 ? (
            <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
              This tutor has no bookable subjects right now.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="text-center">
                <p className="text-sm text-neutral-500 dark:text-neutral-400">Book a session with</p>
                <p className="font-display text-xl font-semibold text-neutral-900 dark:text-neutral-50">
                  {tutorPage.profile.displayName}
                </p>
              </div>

              <Field label="Subject">
                <Select
                  value={tutorSubjectId}
                  onChange={(e) => setTutorSubjectId(e.target.value)}
                >
                  {tutorPage.offerings.map((o) => (
                    <option key={o.tutorSubjectId} value={o.tutorSubjectId}>
                      {o.subjectName.en} · {formatMinor(o.hourlyRateMinor, 'INR')}/hr
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Start time">
                <Input
                  type="datetime-local"
                  value={startLocal}
                  onChange={(e) => setStartLocal(e.target.value)}
                />
              </Field>

              <Field label="Duration (minutes)">
                <Select
                  value={durationMin}
                  onChange={(e) => setDurationMin(e.target.value)}
                >
                  {[30, 45, 60, 90, 120].map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </Select>
              </Field>

              {error && <InlineError>{error}</InlineError>}

              <Button onClick={() => void book()} disabled={submitting} loading={submitting}>
                {submitting ? 'Booking…' : 'Book & pay'}
              </Button>

              {error && slotUnavailable && !joinedWaitlist && (
                <Button variant="secondary" onClick={() => void joinWaitlist()}>
                  <Clock3 className="h-4 w-4" aria-hidden />
                  That time doesn&apos;t work — join waitlist instead
                </Button>
              )}
              {joinedWaitlist && (
                <p className="flex items-center justify-center gap-1.5 text-center text-sm text-success dark:text-success-dark">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  You&apos;re on the waitlist — we&apos;ll notify you when a slot opens.
                </p>
              )}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
