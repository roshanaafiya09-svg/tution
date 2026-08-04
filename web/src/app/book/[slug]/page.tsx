'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, formatMinor, tokenStore, ApiError } from '@/lib/api';
import { payForOrder } from '@/lib/razorpay';
import type { Booking, PaymentOrder, PublicTutorPage } from '@/lib/types';
import { Card, Button, Field, inputClass } from '@/components/ui';

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
    if (!tokenStore.access) {
      router.push(`/login?next=/book/${slug}`);
      return;
    }

    setError(null);
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
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not book that slot. Try a different time.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function joinWaitlist() {
    if (!tokenStore.access) {
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
    <main className="min-h-screen bg-neutral-50 px-6 py-8">
      <div className="mx-auto max-w-md">
        <Link href="/" className="mb-6 block text-center font-display text-2xl font-semibold italic text-brand-800">
          Scholar
        </Link>

        <Card>
          {confirmed ? (
            <div className="text-center">
              <p className="font-display text-2xl font-semibold text-neutral-900">Booked</p>
              <p className="mt-2 text-sm text-neutral-500">
                Your session with {tutorPage?.profile.displayName ?? 'your tutor'} is confirmed.
              </p>
              <Link href="/bookings">
                <Button className="mt-6 w-full">View my bookings</Button>
              </Link>
            </div>
          ) : tutorPage === null ? (
            <p className="text-center text-sm text-neutral-400">{error ?? 'Loading…'}</p>
          ) : tutorPage.offerings.length === 0 ? (
            <p className="text-center text-sm text-neutral-500">
              This tutor has no bookable subjects right now.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="text-center">
                <p className="text-sm text-neutral-500">Book a session with</p>
                <p className="font-display text-xl font-semibold text-neutral-900">
                  {tutorPage.profile.displayName}
                </p>
              </div>

              <Field label="Subject">
                <select
                  className={inputClass}
                  value={tutorSubjectId}
                  onChange={(e) => setTutorSubjectId(e.target.value)}
                >
                  {tutorPage.offerings.map((o) => (
                    <option key={o.tutorSubjectId} value={o.tutorSubjectId}>
                      {o.subjectName.en} · {formatMinor(o.hourlyRateMinor, 'INR')}/hr
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Start time">
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={startLocal}
                  onChange={(e) => setStartLocal(e.target.value)}
                />
              </Field>

              <Field label="Duration (minutes)">
                <select
                  className={inputClass}
                  value={durationMin}
                  onChange={(e) => setDurationMin(e.target.value)}
                >
                  {[30, 45, 60, 90, 120].map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              </Field>

              {error && <p className="text-sm text-error">{error}</p>}

              <Button onClick={() => void book()} disabled={submitting}>
                {submitting ? 'Booking…' : 'Book & pay'}
              </Button>

              {error && !joinedWaitlist && (
                <Button variant="secondary" onClick={() => void joinWaitlist()}>
                  That time doesn&apos;t work — join waitlist instead
                </Button>
              )}
              {joinedWaitlist && (
                <p className="text-center text-sm text-success">
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
