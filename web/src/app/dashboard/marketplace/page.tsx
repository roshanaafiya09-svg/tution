'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Award,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Globe,
  LocateFixed,
  MapPin,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import type {
  AvailabilityRule,
  Booking,
  ContactRequest,
  ProofOfTeaching,
  Subject,
  TutorLocation,
  TutorProfile,
  TutorSubject,
} from '@/lib/types';
import {
  Badge,
  Button,
  buttonVariants,
  CardSkeleton,
  CardTitle,
  ErrorState,
  Field,
  InlineError,
  Input,
  Spinner,
  StatusBadge,
  useToast,
} from '@/components/ui';
import {
  TeacherPageHeader,
  AcademicCard,
  CompletenessCard,
  EmptyPanel,
  SectionHeader,
  type CompletenessItem,
} from '@/components/dashboard';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'T';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const TEACHING_MODE_LABEL: Record<string, string> = {
  online: 'Online',
  offline: 'In-person',
  both: 'Online & in-person',
};

export default function MarketplacePage() {
  const toast = useToast();
  const [location, setLocation] = useState<TutorLocation | null | undefined>(undefined);
  const [proofOfTeaching, setProofOfTeaching] = useState<ProofOfTeaching | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [contactRequests, setContactRequests] = useState<ContactRequest[] | null>(null);
  const [markingReadId, setMarkingReadId] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tutorSubjects, setTutorSubjects] = useState<TutorSubject[]>([]);
  const [availabilityRules, setAvailabilityRules] = useState<AvailabilityRule[]>([]);
  const [profile, setProfile] = useState<TutorProfile | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [locating, setLocating] = useState(false);
  const [scoreExplainerOpen, setScoreExplainerOpen] = useState(false);

  const [locForm, setLocForm] = useState({ city: '', areaLabel: '', lat: '', lng: '' });
  const [savingLocation, setSavingLocation] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [loc, pot, own, subj, tutorSubj, rules, prof, requests] = await Promise.all([
        api.get<TutorLocation | null>('/marketplace/locations/me'),
        api.get<ProofOfTeaching>('/marketplace/proof-of-teaching/me'),
        api.get<Booking[]>('/marketplace/bookings/tutor'),
        api.get<Subject[]>('/catalog/subjects'),
        api.get<TutorSubject[]>('/tutor-subjects/me'),
        api.get<AvailabilityRule[]>('/availability/me'),
        api.get<TutorProfile | null>('/profiles/tutor/me'),
        api.get<ContactRequest[]>('/marketplace/discovery/contact-requests/me'),
      ]);
      setLocation(loc);
      setProofOfTeaching(pot);
      setBookings(own);
      setSubjects(subj);
      setTutorSubjects(tutorSubj);
      setAvailabilityRules(rules);
      setProfile(prof);
      setContactRequests(requests);
      if (loc) {
        setLocForm({
          city: loc.city,
          areaLabel: loc.area_label ?? '',
          lat: String(loc.lat),
          lng: String(loc.lng),
        });
      } else {
        setShowLocationForm(true);
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
        setLocForm((f) => ({ ...f, lat: String(pos.coords.latitude), lng: String(pos.coords.longitude) }));
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
      setShowLocationForm(false);
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

  async function markContactRequestRead(id: string) {
    setMarkingReadId(id);
    try {
      await api.post(`/marketplace/discovery/contact-requests/${id}/read`);
      await load();
    } catch {
      toast({ title: 'Could not update this request', variant: 'error' });
    } finally {
      setMarkingReadId(null);
    }
  }

  function requesterLabel(request: ContactRequest): string {
    if (request.requester_role === 'student' && request.student_display_name) {
      return request.student_display_name;
    }
    return request.email ?? request.phone_e164;
  }

  const upcoming = bookings?.filter((b) => b.status === 'confirmed') ?? [];
  const other = bookings?.filter((b) => b.status !== 'confirmed') ?? [];

  const readinessItems: CompletenessItem[] = [
    { key: 'profile', label: 'Public profile created', done: !!profile, href: '/dashboard/teacher-profile' },
    { key: 'location', label: 'Location added', done: !!location },
    { key: 'subject', label: 'Subject added', done: tutorSubjects.length > 0, href: '/dashboard/subjects' },
    {
      key: 'availability',
      label: 'Availability added',
      done: availabilityRules.length > 0,
      href: '/dashboard/availability',
    },
    {
      key: 'verification',
      label: 'Verification completed',
      done: profile?.verification_status === 'verified',
      href: '/dashboard/verification',
    },
  ];
  const readinessDone = readinessItems.filter((i) => i.done).length;
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

  const cheapestRate =
    tutorSubjects.length > 0 ? Math.min(...tutorSubjects.map((ts) => ts.hourly_rate_minor)) : null;
  const rateCurrency = tutorSubjects[0]?.currency ?? 'INR';

  return (
    <div className="space-y-5">
      <TeacherPageHeader
        eyebrow="Business"
        title="Marketplace"
        description="How students and parents discover you in Find a Teacher — your public listing, your score, and the sessions they book."
        action={
          dataLoaded ? (
            <div className="flex items-center gap-2">
              <Badge variant={VISIBILITY_COPY[visibilityStatus].variant}>
                {VISIBILITY_COPY[visibilityStatus].label}
              </Badge>
              {profile?.slug && (
                <a
                  href={`/t/${profile.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  View public profile
                </a>
              )}
            </div>
          ) : undefined
        }
      />

      {error && <InlineError>{error}</InlineError>}

      {loadError ? (
        <ErrorState
          description="Could not load your marketplace profile. Check your connection and try again."
          onRetry={() => void load()}
        />
      ) : !dataLoaded ? (
        <div className="space-y-4">
          <CardSkeleton className="h-40 rounded-2xl" />
          <div className="grid gap-4 lg:grid-cols-2">
            <CardSkeleton className="h-64 rounded-2xl" />
            <CardSkeleton className="h-64 rounded-2xl" />
          </div>
        </div>
      ) : (
        <>
          <CompletenessCard
            title="Marketplace profile"
            items={readinessItems}
            description={
              visibilityStatus === 'visible'
                ? 'students can find and book you'
                : 'finish these to appear in search'
            }
          />

          <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
            <AcademicCard className="flex flex-col">
              <div className="mb-4 flex items-center gap-2">
                <Globe className="h-4 w-4 text-brand-500 dark:text-brand-300" aria-hidden />
                <CardTitle>Public profile preview</CardTitle>
              </div>

              {!profile ? (
                <EmptyPanel
                  icon={Globe}
                  title="No public profile yet"
                  description="Set up your teacher profile and this preview shows exactly what students and parents will see."
                  action={
                    <Link href="/dashboard/teacher-profile" className={buttonVariants({ size: 'sm' })}>
                      Set up profile
                    </Link>
                  }
                  className="border-0 bg-transparent p-0 dark:bg-transparent"
                />
              ) : (
                <>
                  <div className="rounded-xl border border-neutral-200/70 bg-neutral-50/60 p-4 dark:border-neutral-800/80 dark:bg-neutral-900/40">
                    <div className="flex items-start gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 font-display text-lg font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                        {profile.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          initials(profile.display_name)
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                            {profile.display_name}
                          </p>
                          {profile.verification_status === 'verified' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-[11px] font-medium text-success dark:bg-success/15 dark:text-success-dark">
                              <ShieldCheck className="h-3 w-3" aria-hidden />
                              Verified
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-300">
                          {profile.headline ?? 'No teaching title set yet'}
                        </p>
                        <p className="mt-1.5 flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                          <MapPin className="h-3 w-3" aria-hidden />
                          {location
                            ? `${location.area_label ? `${location.area_label}, ` : ''}${location.city}`
                            : 'Location not set'}
                          {profile.teaching_mode ? ` · ${TEACHING_MODE_LABEL[profile.teaching_mode]}` : ''}
                        </p>
                      </div>
                    </div>

                    <dl className="mt-4 grid gap-3 border-t border-neutral-200/70 pt-3 text-sm sm:grid-cols-2 dark:border-neutral-800/80">
                      <div>
                        <dt className="text-xs uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                          Subjects
                        </dt>
                        <dd className="mt-1 text-neutral-700 dark:text-neutral-200">
                          {tutorSubjects.length === 0
                            ? '—'
                            : [...new Set(tutorSubjects.map((ts) => subjectName(ts.subject_id)))].join(', ')}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                          Grades
                        </dt>
                        <dd className="mt-1 text-neutral-700 dark:text-neutral-200">
                          {tutorSubjects.length === 0
                            ? '—'
                            : `${Math.min(...tutorSubjects.map((t) => t.grade_min))}–${Math.max(
                                ...tutorSubjects.map((t) => t.grade_max),
                              )}`}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                          From
                        </dt>
                        <dd className="mt-1 text-neutral-700 dark:text-neutral-200">
                          {cheapestRate === null ? '—' : `${formatMinor(cheapestRate, rateCurrency)}/hr`}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                          Experience
                        </dt>
                        <dd className="mt-1 text-neutral-700 dark:text-neutral-200">
                          {profile.years_experience != null ? `${profile.years_experience} years` : '—'}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {profile.slug && (
                      <a
                        href={`/t/${profile.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        View public profile
                      </a>
                    )}
                    <Link
                      href="/dashboard/teacher-profile"
                      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                    >
                      Edit profile
                    </Link>
                  </div>
                  <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
                    Drawn from your saved profile, subjects, and location — the live page also shows reviews and
                    open batches.
                  </p>
                </>
              )}
            </AcademicCard>

            <AcademicCard>
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
                  <p className="font-display text-4xl font-semibold text-neutral-900 dark:text-neutral-50">
                    {proofOfTeaching.score}
                  </p>
                  <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                    Calculated automatically — nothing to submit
                  </p>
                  <dl className="mt-4 space-y-2 border-t border-neutral-100 pt-3 text-sm dark:border-neutral-800">
                    <div className="flex justify-between gap-3">
                      <dt className="text-neutral-500 dark:text-neutral-400">Verified hours</dt>
                      <dd className="tabular-nums text-neutral-900 dark:text-neutral-100">
                        {proofOfTeaching.inputs.verifiedHours}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-neutral-500 dark:text-neutral-400">Attendance retention</dt>
                      <dd className="tabular-nums text-neutral-900 dark:text-neutral-100">
                        {proofOfTeaching.inputs.attendanceRetentionRate ?? '—'}%
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-neutral-500 dark:text-neutral-400">Quiz score trend</dt>
                      <dd className="capitalize text-neutral-900 dark:text-neutral-100">
                        {proofOfTeaching.inputs.quizImprovementTrend}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-neutral-500 dark:text-neutral-400">Students taught</dt>
                      <dd className="tabular-nums text-neutral-900 dark:text-neutral-100">
                        {proofOfTeaching.studentsTaught}
                      </dd>
                    </div>
                  </dl>

                  <button
                    type="button"
                    onClick={() => setScoreExplainerOpen((s) => !s)}
                    aria-expanded={scoreExplainerOpen}
                    className="mt-3 flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                  >
                    {scoreExplainerOpen ? (
                      <ChevronUp className="h-3 w-3" aria-hidden />
                    ) : (
                      <ChevronDown className="h-3 w-3" aria-hidden />
                    )}
                    How is this calculated?
                  </button>
                  {scoreExplainerOpen && (
                    <p className="mt-2 rounded-lg bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
                      Your score blends three signals: hours you&apos;ve actually taught and had verified through
                      the app, the share of students who keep attending after their first session with you, and
                      whether your students&apos; quiz scores trend up over time. It updates automatically as you
                      teach — there&apos;s nothing to submit, and it can&apos;t be edited.
                    </p>
                  )}
                </>
              )}
            </AcademicCard>
          </div>

          <AcademicCard>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-500 dark:text-brand-300" aria-hidden />
                <div className="min-w-0">
                  <CardTitle>Location</CardTitle>
                  <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                    {location
                      ? `${location.area_label ? `${location.area_label}, ` : ''}${location.city}`
                      : 'Not set — students filter by city, so this is required to appear in search.'}
                  </p>
                </div>
              </div>
              {location && !showLocationForm && (
                <Button variant="secondary" size="sm" onClick={() => setShowLocationForm(true)}>
                  Edit
                </Button>
              )}
            </div>

            {showLocationForm && (
              <div className="mt-4 grid gap-3 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                <div className="grid gap-3 sm:grid-cols-2">
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
                </div>

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
                  className="rounded-md border border-neutral-200 dark:border-neutral-800"
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

                <div className="flex gap-2">
                  <Button
                    onClick={() => void saveLocation()}
                    disabled={savingLocation || !locForm.city || !locForm.lat || !locForm.lng}
                    loading={savingLocation}
                  >
                    {savingLocation ? 'Saving…' : 'Save location'}
                  </Button>
                  {location && (
                    <Button variant="secondary" onClick={() => setShowLocationForm(false)} disabled={savingLocation}>
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            )}
          </AcademicCard>

          <SectionHeader eyebrow="1:1 sessions" title="Upcoming bookings" className="mb-0 pt-2" />
          {upcoming.length === 0 ? (
            <EmptyPanel
              icon={CalendarClock}
              title="No upcoming bookings"
              description="Sessions students book directly with you appear here — and on your calendar — once your listing is live."
              action={
                readinessDone < readinessItems.length ? (
                  <Link href="/dashboard/subjects" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                    Finish your listing
                  </Link>
                ) : (
                  <Link href="/dashboard/calendar" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                    Open calendar
                  </Link>
                )
              }
            />
          ) : (
            <AcademicCard className="p-0">
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {upcoming.map((booking) => (
                  <li
                    key={booking.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                        {subjectName(booking.subject_id)}
                      </p>
                      <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                        {new Date(booking.scheduled_start_utc).toLocaleString('en-IN', {
                          timeZone: booking.timezone,
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}{' '}
                        · {formatMinor(booking.amount_minor, booking.currency)}
                        {booking.original_scheduled_start_utc ? ' · rescheduled' : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
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
                        No-show
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </AcademicCard>
          )}

          {other.length > 0 && (
            <>
              <SectionHeader eyebrow="History" title="Past & other bookings" className="mb-0 pt-2" />
              <AcademicCard className="p-0">
                <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {other.map((booking) => (
                    <li key={booking.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                          {subjectName(booking.subject_id)}
                        </p>
                        <p className="text-xs text-neutral-400 dark:text-neutral-500">
                          {new Date(booking.scheduled_start_utc).toLocaleDateString('en-IN')}
                        </p>
                      </div>
                      <StatusBadge status={booking.status} />
                    </li>
                  ))}
                </ul>
              </AcademicCard>
            </>
          )}

          <SectionHeader eyebrow="Inbound" title="Contact requests" className="mb-0 pt-2" />
          {contactRequests === null || contactRequests.length === 0 ? (
            <EmptyPanel
              icon={MessageCircle}
              title="No contact requests yet"
              description="When a student or parent reaches out from Find a Teacher, their message and contact details land here."
            />
          ) : (
            <div className="space-y-2.5">
              {contactRequests.map((request) => (
                <AcademicCard key={request.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-neutral-900 dark:text-neutral-50">
                        {requesterLabel(request)}
                      </p>
                      <Badge variant="neutral" className="capitalize">
                        {request.requester_role}
                      </Badge>
                      {!request.read_at && <Badge variant="brand">New</Badge>}
                    </div>
                    {request.message && (
                      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{request.message}</p>
                    )}
                    <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                      {request.phone_e164}
                      {request.email ? ` · ${request.email}` : ''} ·{' '}
                      {new Date(request.created_at).toLocaleString('en-IN')}
                    </p>
                  </div>
                  {!request.read_at && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void markContactRequestRead(request.id)}
                      disabled={markingReadId === request.id}
                    >
                      Mark read
                    </Button>
                  )}
                </AcademicCard>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
