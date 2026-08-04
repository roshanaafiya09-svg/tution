'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, formatMinor } from '@/lib/api';
import type { Booking, ProofOfTeaching, Subject, TutorLocation } from '@/lib/types';
import { Card, PageHeader, EmptyState, StatusBadge, Button, Field, inputClass } from '@/components/ui';

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

      {error && <p className="mb-4 text-sm text-error">{error}</p>}

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="mb-3 font-medium text-neutral-900">Location</p>
          {location === undefined ? (
            <p className="text-sm text-neutral-400">Loading…</p>
          ) : (
            <div className="grid gap-3">
              <Field label="City">
                <input
                  className={inputClass}
                  value={locForm.city}
                  onChange={(e) => setLocForm({ ...locForm, city: e.target.value })}
                  placeholder="Chennai"
                />
              </Field>
              <Field label="Area (optional)">
                <input
                  className={inputClass}
                  value={locForm.areaLabel}
                  onChange={(e) => setLocForm({ ...locForm, areaLabel: e.target.value })}
                  placeholder="Anna Nagar"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Latitude">
                  <input
                    className={inputClass}
                    value={locForm.lat}
                    onChange={(e) => setLocForm({ ...locForm, lat: e.target.value })}
                    placeholder="13.0827"
                  />
                </Field>
                <Field label="Longitude">
                  <input
                    className={inputClass}
                    value={locForm.lng}
                    onChange={(e) => setLocForm({ ...locForm, lng: e.target.value })}
                    placeholder="80.2707"
                  />
                </Field>
              </div>
              <Button
                onClick={() => void saveLocation()}
                disabled={savingLocation || !locForm.city || !locForm.lat || !locForm.lng}
              >
                {savingLocation ? 'Saving…' : 'Save location'}
              </Button>
            </div>
          )}
        </Card>

        <Card>
          <p className="mb-3 font-medium text-neutral-900">Proof-of-Teaching score</p>
          {proofOfTeaching === null ? (
            <p className="text-sm text-neutral-400">Loading…</p>
          ) : (
            <>
              <p className="font-display text-3xl font-semibold text-neutral-900">
                {proofOfTeaching.score}
              </p>
              <dl className="mt-4 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Verified hours</dt>
                  <dd className="text-neutral-900">{proofOfTeaching.inputs.verifiedHours}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Attendance retention</dt>
                  <dd className="text-neutral-900">
                    {proofOfTeaching.inputs.attendanceRetentionRate ?? '—'}%
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Quiz score trend</dt>
                  <dd className="capitalize text-neutral-900">
                    {proofOfTeaching.inputs.quizImprovementTrend}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </Card>
      </div>

      <h2 className="mb-3 text-lg font-semibold text-neutral-900">Upcoming bookings</h2>
      {bookings === null ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : upcoming.length === 0 ? (
        <div className="mb-8">
          <EmptyState title="No upcoming bookings" description="1:1 sessions students book with you appear here." />
        </div>
      ) : (
        <div className="mb-8 space-y-3">
          {upcoming.map((booking) => (
            <Card key={booking.id} className="flex items-center justify-between">
              <div>
                <p className="font-medium text-neutral-900">{subjectName(booking.subject_id)}</p>
                <p className="text-sm text-neutral-500">
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
                  onClick={() => void complete(booking.id)}
                  disabled={busyId === booking.id}
                >
                  Mark complete
                </Button>
                <Button
                  variant="danger"
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
          <h2 className="mb-3 text-lg font-semibold text-neutral-900">Past & other bookings</h2>
          <Card className="divide-y divide-neutral-100 p-0">
            {other.map((booking) => (
              <div key={booking.id} className="flex items-center justify-between px-6 py-3">
                <div>
                  <p className="text-sm font-medium text-neutral-900">{subjectName(booking.subject_id)}</p>
                  <p className="text-sm text-neutral-500">
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
