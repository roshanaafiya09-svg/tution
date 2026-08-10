'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { MapPin, Award, CalendarClock, LocateFixed, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import type {
  AvailabilityRule,
  Booking,
  ProofOfTeaching,
  Subject,
  TutorLocation,
  TutorProfile,
  TutorSubject,
} from '@/lib/types';
import {
  Card,
  CardTitle,
  PageHeader,
  EmptyState,
  StatusBadge,
  Badge,
  Button,
  Field,
  Input,
  InlineError,
  CardSkeleton,
  ErrorState,
  Spinner,
  useToast,
} from '@/components/ui';
import { cn } from '@/lib/cn';

export default function MarketplacePage() {
  const toast = useToast();
  const [location, setLocation] = useState<TutorLocation | null | undefined>(undefined);
  const [proofOfTeaching, setProofOfTeaching] = useState<ProofOfTeaching | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tutorSubjects, setTutorSubjects] = useState<TutorSubject[]>([]);
  const [availabilityRules, setAvailabilityRules] = useState<AvailabilityRule[]>([]);
  const [profile, setProfile] = useState<TutorProfile | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [locating, setLocating] = useState(false);
  const [scoreExplainerOpen, setScoreExplainerOpen] = useState(false);

  const [locForm, setLocForm] = useState({ city: '', areaLabel: '', lat: '', lng: '' });
  const [savingLocation, setSavingLocation] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [loc, pot, own, subj, tutorSubj, rules, prof] = await Promise.all([
        api.get<TutorLocation | null>('/marketplace/locations/me'),
        api.get<ProofOfTeaching>('/marketplace/proof-of-teaching/me'),
        api.get<Booking[]>('/marketplace/bookings/tutor'),
        api.get<Subject[]>('/catalog/subjects'),
        api.get<TutorSubject[]>('/tutor-subjects/me'),
        api.get<AvailabilityRule[]>('/availability/me'),
        api.get<TutorProfile | null>('/profiles/tutor/me'),
      ]);
      setLocation(loc);
      setProofOfTeaching(pot);
      setBookings(own);
      setSubjects(subj);
      setTutorSubjects(tutorSubj);
      setAvailabilityRules(rules);
      setProfile(prof);
      if (loc) {
        setLocForm({
          city: loc.city,
          areaLabel: loc.area_label ?? '',
          lat: String(loc.lat),
          lng: String(loc.lng),
        });
      }
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function subjectName(subjectId: string): string {
    return subjects.find((s) => s.id === subjectId)?.name_i18n.en ?? 'Session';
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError('Location services are not available in this browser — enter coordinates manually below.');
      return;
    }
    setError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocForm((f) => ({
          ...f,
          lat: String(pos.coords.latitude),
          lng: String(pos.coords.longitude),
        }));
        setShowAdvanced(true);
        setLocating(false);
      },
      () => {
        setError('Could not get your location. Enter it manually below.');
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
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
      toast({ title: 'Location saved', variant: 'success' });
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
      toast({ title: 'Booking marked complete', variant: 'success' });
    } catch {
      toast({ title: 'Could not update this booking', variant: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  async function noShow(bookingId: string) {
    setBusyId(bookingId);
    try {
      await api.post(`/marketplace/bookings/${bookingId}/no-show`);
      await load();
      toast({ title: 'Marked as no-show', variant: 'success' });
    } catch {
      toast({ title: 'Could not update this booking', variant: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  const upcoming = bookings?.filter((b) => b.status === 'confirmed') ?? [];
  const other = bookings?.filter((b) => b.status !== 'confirmed') ?? [];

  const readinessItems = [
    { key: 'location', label: 'Location added', done: !!location },
    { key: 'subject', label: 'Subject added', done: tutorSubjects.length > 0 },
    { key: 'availability', label: 'Availability added', done: availabilityRules.length > 0 },
    { key: 'verification', label: 'Verification completed', done: profile?.verification_status === 'verified' },
  ];
  const readinessDone = readinessItems.filter((i) => i.done).length;
  const readinessPercent = Math.round((readinessDone / readinessItems.length) * 100);
  const dataLoaded = location !== undefined && bookings !== null;

  const visibilityStatus: 'visible' | 'verification_required' | 'incomplete' = !dataLoaded
    ? 'incomplete'
    : readinessDone === readinessItems.length
      ? 'visible'
      : readinessItems.filter((i) => i.key !== 'verification').every((i) => i.done)
        ? 'verification_required'
        : 'incomplete';

  const VISIBILITY_COPY = {
    visible: { label: 'Profile visible', variant: 'success' as const },
    verification_required: { label: 'Verification required', variant: 'warning' as const },
    incomplete: { label: 'Profile incomplete', variant: 'warning' as const },
  };

  return (
    <div>
      <PageHeader
        title="Marketplace"
        description="Your public discovery listing, Proof-of-Teaching score, and 1:1 bookings."
        action={
          dataLoaded ? (
            <Badge variant={VISIBILITY_COPY[visibilityStatus].variant}>
              {VISIBILITY_COPY[visibilityStatus].label}
            </Badge>
          ) : undefined
        }
      />

      {error && (
        <div className="mb-4">
          <InlineError>{error}</InlineError>
        </div>
      )}

      {loadError && (
        <ErrorState
          description="Could not load your marketplace profile. Check your connection and try again."
          onRetry={() => void load()}
        />
      )}

      {!loadError && dataLoaded && (
        <Card className="mb-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                Marketplace profile
              </p>
              <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                {readinessPercent}% complete
              </p>
            </div>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-base dark:bg-brand-400"
              style={{ width: `${readinessPercent}%` }}
            />
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {readinessItems.map((item) => (
              <li key={item.key} className="flex items-center gap-2 text-sm">
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                    item.done
                      ? 'border-success bg-success-bg text-success dark:border-success-dark/40 dark:bg-success/15 dark:text-success-dark'
                      : 'border-neutral-300 text-transparent dark:border-neutral-700',
                  )}
                >
                  {item.done && <Check className="h-3 w-3" aria-hidden />}
                </span>
                <span
                  className={
                    item.done
                      ? 'text-neutral-500 dark:text-neutral-400'
                      : 'font-medium text-neutral-700 dark:text-neutral-200'
                  }
                >
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!loadError && (
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-brand-500 dark:text-brand-300" aria-hidden />
            <CardTitle>Location</CardTitle>
          </div>
          {location === undefined ? (
            <div className="flex min-h-[8rem] items-center justify-center">
              <Spinner className="h-5 w-5 text-neutral-400 dark:text-neutral-500" />
            </div>
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

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={useMyLocation}
                disabled={locating}
                loading={locating}
                className="justify-self-start"
              >
                <LocateFixed className="h-3.5 w-3.5" aria-hidden />
                {locating ? 'Locating…' : 'Use my current location'}
              </Button>

              <details
                className="group rounded-md border border-neutral-200 dark:border-neutral-800"
                open={showAdvanced}
                onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
                  Advanced: latitude &amp; longitude
                  {showAdvanced ? (
                    <ChevronUp className="h-4 w-4 text-neutral-400" aria-hidden />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-neutral-400" aria-hidden />
                  )}
                </summary>
                <div className="grid grid-cols-2 gap-3 border-t border-neutral-100 p-3 dark:border-neutral-800">
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
              </details>

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
            <CardTitle>Proof-of-Teaching score</CardTitle>
          </div>
          {proofOfTeaching === null ? (
            <div className="flex min-h-[8rem] items-center justify-center">
              <Spinner className="h-5 w-5 text-neutral-400 dark:text-neutral-500" />
            </div>
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

              <button
                type="button"
                onClick={() => setScoreExplainerOpen((s) => !s)}
                className="mt-3 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
              >
                {scoreExplainerOpen ? 'Hide' : 'How is this calculated?'}
              </button>
              {scoreExplainerOpen && (
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                  Your score blends three signals: hours you&apos;ve actually taught and had verified through the
                  app, the share of students who keep attending after their first session with you, and whether
                  your students&apos; quiz scores are trending up over time. It updates automatically as you teach
                  — there&apos;s nothing to submit.
                </p>
              )}
            </>
          )}
        </Card>
      </div>
      )}

      {!loadError && (
      <>
      <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">Upcoming bookings</h2>
      {bookings === null ? (
        <div className="mb-8 space-y-3">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : upcoming.length === 0 ? (
        <div className="mb-8">
          <EmptyState
            icon={CalendarClock}
            title="No upcoming bookings"
            description="1:1 sessions students book with you appear here. Complete your marketplace profile above to start receiving them."
            action={
              readinessDone < readinessItems.length ? (
                <Link href="/dashboard/subjects">
                  <Button variant="secondary" size="sm">
                    Complete your profile
                  </Button>
                </Link>
              ) : undefined
            }
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
      </>
      )}
    </div>
  );
}
