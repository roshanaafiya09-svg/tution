'use client';

import { useCallback, useEffect, useState } from 'react';
import { MapPin, Award, CalendarClock } from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import type { Booking, ProofOfTeaching, Subject, TutorLocation } from '@/lib/types';
import {
  Card,
  PageHeader,
  EmptyState,
  StatusBadge,
  Button,
  Field,
  Input,
  InlineError,
  PageLoading,
} from '@/components/ui';

export default function MarketplacePage() {
  const [location, setLocation] = useState<TutorLocation | null | undefined>(undefined);
  const [proofOfTeaching, setProofOfTeaching] = useState<ProofOfTeaching | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [locForm, setLocForm] = useState({ city: '', areaLabel: '', lat: '', lng: '' });
  const [savingLocation, setSavingLocation] = useState(false);

  const load = useCallback(async () => {
    const [loc, pot, own, subj] = await Promise.all([
      api.get<TutorLocation | null>('/marketplace/locations/me'),
      api.get<ProofOfTeaching>('/marketplace/proof-of-teaching/me'),
      api.get<Booking[]>('/marketplace/bookings/tutor'),
      api.get<Subject[]>('/catalog/subjects'),
    ]);
    setLocation(loc);
    setProofOfTeaching(pot);
    setBookings(own);
    setSubjects(subj);
    if (loc) {
      setLocForm({
        city: loc.city,
        areaLabel: loc.area_label ?? '',
        lat: String(loc.lat),
        lng: String(loc.lng),
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function subjectName(subjectId: string): string {
    return subjects.find((s) => s.id === subjectId)?.name_i18n.en ?? 'Session';
  }

  async function saveLocation() {
    setSavingLocation(true);
    setError(null);
    try {
      await api.put('/marketplace/locations', {
        city: locForm.city,
        areaLabel: locForm.areaLabel || undefined,
        lat: Number(locForm.lat),
        lng: Number(locForm.lng),
      });
      await load();
    } catch {
      setError('Could not save your location.');
    } finally {
      setSavingLocation(false);
    }
  }

  async function complete(bookingId: string) {
    setBusyId(bookingId);
    try {
      await api.post(`/marketplace/bookings/${bookingId}/complete`);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function noShow(bookingId: string) {
    setBusyId(bookingId);
    try {
      await api.post(`/marketplace/bookings/${bookingId}/no-show`);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const upcoming = bookings?.filter((b) => b.status === 'confirmed') ?? [];
  const other = bookings?.filter((b) => b.status !== 'confirmed') ?? [];

  return (
    <div>
      <PageHeader
        title="Marketplace"
        description="Your public discovery listing, Proof-of-Teaching score, and 1:1 bookings."
      />

      {error && (
        <div className="mb-4">
          <InlineError>{error}</InlineError>
        </div>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-brand-500 dark:text-brand-300" aria-hidden />
            <p className="font-medium text-neutral-900 dark:text-neutral-50">Location</p>
          </div>
          {location === undefined ? (
            <PageLoading label="Loading…" />
          ) : (
            <div className="grid gap-3">
              <Field label="City">
                <Input
                  value={locForm.city}
                  onChange={(e) => setLocForm({ ...locForm, city: e.target.value })}
                  placeholder="Chennai"
                />
              </Field>
              <Field label="Area (optional)">
                <Input
                  value={locForm.areaLabel}
                  onChange={(e) => setLocForm({ ...locForm, areaLabel: e.target.value })}
                  placeholder="Anna Nagar"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Latitude">
                  <Input
                    value={locForm.lat}
                    onChange={(e) => setLocForm({ ...locForm, lat: e.target.value })}
                    placeholder="13.0827"
                  />
                </Field>
                <Field label="Longitude">
                  <Input
                    value={locForm.lng}
                    onChange={(e) => setLocForm({ ...locForm, lng: e.target.value })}
                    placeholder="80.2707"
                  />
                </Field>
              </div>
              <Button
                onClick={() => void saveLocation()}
                disabled={savingLocation || !locForm.city || !locForm.lat || !locForm.lng}
                loading={savingLocation}
              >
                {savingLocation ? 'Saving…' : 'Save location'}
              </Button>
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Award className="h-4 w-4 text-brand-500 dark:text-brand-300" aria-hidden />
            <p className="font-medium text-neutral-900 dark:text-neutral-50">Proof-of-Teaching score</p>
          </div>
          {proofOfTeaching === null ? (
            <PageLoading label="Loading…" />
          ) : (
            <>
              <p className="font-display text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
                {proofOfTeaching.score}
              </p>
              <dl className="mt-4 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-neutral-500 dark:text-neutral-400">Verified hours</dt>
                  <dd className="text-neutral-900 dark:text-neutral-100">
                    {proofOfTeaching.inputs.verifiedHours}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500 dark:text-neutral-400">Attendance retention</dt>
                  <dd className="text-neutral-900 dark:text-neutral-100">
                    {proofOfTeaching.inputs.attendanceRetentionRate ?? '—'}%
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500 dark:text-neutral-400">Quiz score trend</dt>
                  <dd className="capitalize text-neutral-900 dark:text-neutral-100">
                    {proofOfTeaching.inputs.quizImprovementTrend}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </Card>
      </div>

      <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">Upcoming bookings</h2>
      {bookings === null ? (
        <PageLoading />
      ) : upcoming.length === 0 ? (
        <div className="mb-8">
          <EmptyState
            icon={CalendarClock}
            title="No upcoming bookings"
            description="1:1 sessions students book with you appear here."
          />
        </div>
      ) : (
        <div className="mb-8 space-y-3">
          {upcoming.map((booking) => (
            <Card key={booking.id} className="flex flex-wrap items-center justify-between gap-3">
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
                  · {formatMinor(booking.amount_minor, booking.currency)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void complete(booking.id)}
                  disabled={busyId === booking.id}
                >
                  Mark complete
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => void noShow(booking.id)}
                  disabled={busyId === booking.id}
                >
                  Student no-show
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {other.length > 0 && (
        <>
          <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            Past & other bookings
          </h2>
          <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
            {other.map((booking) => (
              <div key={booking.id} className="flex items-center justify-between px-6 py-3">
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    {subjectName(booking.subject_id)}
                  </p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {new Date(booking.scheduled_start_utc).toLocaleDateString('en-IN')}
                  </p>
                </div>
                <StatusBadge status={booking.status} />
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
