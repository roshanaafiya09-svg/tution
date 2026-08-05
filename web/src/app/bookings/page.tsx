'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CalendarClock, Star } from 'lucide-react';
import { api, formatMinor, tokenStore, ApiError } from '@/lib/api';
import type { Booking, Subject } from '@/lib/types';
import { Card, EmptyState, StatusBadge, Button, Field, Input, Select, InlineError, PageLoading } from '@/components/ui';

export default function MyBookingsPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [newStart, setNewStart] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewForm, setReviewForm] = useState({ rating: '5', comment: '' });
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBookings(await api.get<Booking[]>('/marketplace/bookings/me'));
  }, []);

  useEffect(() => {
    if (!tokenStore.access) {
      router.replace('/login?next=/bookings');
      return;
    }
    void api.get<Subject[]>('/catalog/subjects').then(setSubjects);
    load().catch(() => setError('Could not load your bookings.'));
  }, [router, load]);

  function subjectName(subjectId: string): string {
    return subjects.find((s) => s.id === subjectId)?.name_i18n.en ?? 'Session';
  }

  async function cancel(bookingId: string) {
    setBusyId(bookingId);
    setError(null);
    try {
      await api.post(`/marketplace/bookings/${bookingId}/cancel`);
      await api.post(`/payments/booking/${bookingId}/refund`).catch(() => undefined);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel this booking.');
    } finally {
      setBusyId(null);
    }
  }

  async function reschedule(bookingId: string) {
    if (!newStart) return;
    setBusyId(bookingId);
    setError(null);
    try {
      await api.post(`/marketplace/bookings/${bookingId}/reschedule`, {
        startLocal: newStart,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setReschedulingId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reschedule this booking.');
    } finally {
      setBusyId(null);
    }
  }

  async function submitReview(booking: Booking) {
    setBusyId(booking.id);
    setError(null);
    try {
      await api.post('/marketplace/reviews', {
        tutorId: booking.tutor_id,
        rating: Number(reviewForm.rating),
        comment: reviewForm.comment || undefined,
      });
      setReviewingId(null);
      setReviewForm({ rating: '5', comment: '' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your review.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:border-neutral-800 dark:bg-neutral-950/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
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

      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-6 font-display text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
          My bookings
        </h1>

        {error && (
          <div className="mb-4">
            <InlineError>{error}</InlineError>
          </div>
        )}

        {bookings === null ? (
          error ? null : <PageLoading />
        ) : bookings.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No bookings yet"
            description="Sessions you book with tutors will show up here."
          />
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => (
              <Card key={booking.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-neutral-50">
                      {subjectName(booking.subject_id)}
                    </p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      {new Date(booking.scheduled_start_utc).toLocaleString('en-IN', {
                        timeZone: booking.timezone,
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}{' '}
                      · {booking.duration_min} min · {formatMinor(booking.amount_minor, booking.currency)}
                    </p>
                  </div>
                  <StatusBadge status={booking.status} />
                </div>

                {booking.status === 'confirmed' && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setReschedulingId(reschedulingId === booking.id ? null : booking.id);
                        setNewStart('');
                      }}
                    >
                      Reschedule
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => void cancel(booking.id)}
                      disabled={busyId === booking.id}
                      loading={busyId === booking.id}
                    >
                      Cancel
                    </Button>
                  </div>
                )}

                {booking.status === 'completed' && (
                  <div className="mt-4">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setReviewingId(reviewingId === booking.id ? null : booking.id)}
                    >
                      Leave a review
                    </Button>
                  </div>
                )}

                {reschedulingId === booking.id && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <Field label="New start time">
                      <Input
                        type="datetime-local"
                        value={newStart}
                        onChange={(e) => setNewStart(e.target.value)}
                      />
                    </Field>
                    <Button
                      onClick={() => void reschedule(booking.id)}
                      disabled={!newStart || busyId === booking.id}
                      loading={busyId === booking.id}
                    >
                      Confirm
                    </Button>
                  </div>
                )}

                {reviewingId === booking.id && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-[120px_1fr_auto] sm:items-end">
                    <Field label="Rating">
                      <Select
                        value={reviewForm.rating}
                        onChange={(e) => setReviewForm({ ...reviewForm, rating: e.target.value })}
                      >
                        {[5, 4, 3, 2, 1].map((r) => (
                          <option key={r} value={r}>
                            {r} ★
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Comment (optional)">
                      <Input
                        value={reviewForm.comment}
                        onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                      />
                    </Field>
                    <Button onClick={() => void submitReview(booking)} disabled={busyId === booking.id} loading={busyId === booking.id}>
                      <Star className="h-3.5 w-3.5" aria-hidden />
                      Submit
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
