'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Award,
  BookMarked,
  CalendarClock,
  ExternalLink,
  Languages,
  MapPin,
  Pencil,
  School,
  Search,
  Star,
  Trash2,
  Users,
  UserCircle,
} from 'lucide-react';
import { api, ApiError, formatMinor } from '@/lib/api';
import type {
  AcademyCardResult,
  AcademySearchResponse,
  Me,
  ProofOfTeaching,
  ReviewSummary,
  Subject,
  TeachingMode,
  TutorAcademyAffiliation,
  TutorJoinRequestSummary,
  TutorLocation,
  TutorProfile,
  TutorSubject,
} from '@/lib/types';
import { academyInitials } from '@/lib/academies';
import {
  Badge,
  Button,
  buttonVariants,
  CardSkeleton,
  ErrorState,
  Field,
  InlineError,
  Input,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '@/components/ui';
import {
  TeacherPageHeader,
  AcademicCard,
  CompletenessCard,
  MetricCard,
  SectionHeader,
  TeacherEmptyState,
  type CompletenessItem,
} from '@/components/dashboard';

const ALLOWED_AVATAR_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_AVATAR_MB = 5;

const TEACHING_MODE_LABEL: Record<TeachingMode, string> = {
  online: 'Online',
  offline: 'In-person',
  both: 'Online & in-person',
};

interface OpenBatch {
  id: string;
  title: string;
  subject_id: string;
  grade_level_id: string;
  capacity: number;
  fee_minor: number;
  currency: string;
  fee_period: string;
  enrolled_count: number;
}

interface FormState {
  displayName: string;
  headline: string;
  bio: string;
  yearsExperience: string;
  qualifications: string;
  languages: string;
  teachingMode: TeachingMode | '';
  methodology: string;
  achievements: string;
  certifications: string;
  feeNote: string;
}

const EMPTY_FORM: FormState = {
  displayName: '',
  headline: '',
  bio: '',
  yearsExperience: '',
  qualifications: '',
  languages: '',
  teachingMode: '',
  methodology: '',
  achievements: '',
  certifications: '',
  feeNote: '',
};

function toForm(profile: TutorProfile): FormState {
  return {
    displayName: profile.display_name,
    headline: profile.headline ?? '',
    bio: profile.bio ?? '',
    yearsExperience: profile.years_experience != null ? String(profile.years_experience) : '',
    qualifications: profile.qualifications ?? '',
    languages: (profile.languages ?? []).join(', '),
    teachingMode: profile.teaching_mode ?? '',
    methodology: profile.methodology ?? '',
    achievements: profile.achievements ?? '',
    certifications: profile.certifications ?? '',
    feeNote: profile.fee_note ?? '',
  };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'T';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** A titled block inside the profile — PROFILE / TEACHING / QUALIFICATIONS. */
function ProfileSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <SectionHeader eyebrow={eyebrow} title={title} className="mb-3" />
      <AcademicCard>{children}</AcademicCard>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-2">
      <dt className="text-sm text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{value}</dd>
    </div>
  );
}

function LongText({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
        {label}
      </p>
      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
        {value}
      </p>
    </div>
  );
}

export default function TeacherProfilePage() {
  const toast = useToast();
  const [profile, setProfile] = useState<TutorProfile | null | undefined>(undefined);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tutorSubjects, setTutorSubjects] = useState<TutorSubject[]>([]);
  const [location, setLocation] = useState<TutorLocation | null>(null);
  const [availabilityCount, setAvailabilityCount] = useState<number | null>(null);
  const [openBatches, setOpenBatches] = useState<OpenBatch[]>([]);
  const [proofOfTeaching, setProofOfTeaching] = useState<ProofOfTeaching | null>(null);
  const [rating, setRating] = useState<ReviewSummary | null>(null);
  const [academies, setAcademies] = useState<TutorAcademyAffiliation[]>([]);
  const [joinRequests, setJoinRequests] = useState<TutorJoinRequestSummary[]>([]);
  const [loadError, setLoadError] = useState(false);

  const [editing, setEditing] = useState(false);
  const [academyChoiceOpen, setAcademyChoiceOpen] = useState(false);
  const [academyQuery, setAcademyQuery] = useState('');
  const [academyPool, setAcademyPool] = useState<AcademyCardResult[] | null>(null);
  const [academyPoolLoading, setAcademyPoolLoading] = useState(false);
  const [academyPoolError, setAcademyPoolError] = useState(false);
  const [selectedAcademy, setSelectedAcademy] = useState<AcademyCardResult | null>(null);
  const [sendingJoinRequest, setSendingJoinRequest] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [meRes, prof, subj, tutorSubj, loc, avail, batches, memberships, requests] = await Promise.all([
        api.get<Me>('/auth/me'),
        api.get<TutorProfile | null>('/profiles/tutor/me'),
        api.get<Subject[]>('/catalog/subjects'),
        api.get<TutorSubject[]>('/tutor-subjects/me'),
        api.get<TutorLocation | null>('/marketplace/locations/me'),
        api.get<unknown[]>('/availability/me'),
        api.get<OpenBatch[]>('/batches/me/open'),
        api.get<TutorAcademyAffiliation[]>('/marketplace/academies/me/memberships'),
        api.get<TutorJoinRequestSummary[]>('/marketplace/academies/me/join-requests'),
      ]);
      setProfile(prof);
      setSubjects(subj);
      setTutorSubjects(tutorSubj);
      setLocation(loc);
      setAvailabilityCount(avail.length);
      setOpenBatches(batches);
      setAcademies(memberships);
      setJoinRequests(requests);

      const [pot, reviews] = await Promise.all([
        api.get<ProofOfTeaching>('/marketplace/proof-of-teaching/me'),
        api.get<{ reviews: unknown[]; summary: ReviewSummary }>(`/marketplace/reviews/tutor/${meRes.id}`),
      ]);
      setProofOfTeaching(pot);
      setRating(reviews.summary);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Candidate pool for the inline "Search Academy by name" field in
   *  profile setup — same GET /marketplace/academies the standalone
   *  Find an Academy pages already use, no separate name-search
   *  endpoint. Filtering by the typed name happens client-side, same
   *  pattern the existing find-an-academy list page already uses. */
  const loadAcademyPool = useCallback(() => {
    setAcademyPoolLoading(true);
    setAcademyPoolError(false);
    api
      .get<AcademySearchResponse>('/marketplace/academies')
      .then((res) => setAcademyPool(res.results))
      .catch(() => setAcademyPoolError(true))
      .finally(() => setAcademyPoolLoading(false));
  }, []);

  /** Reuses the existing join-request endpoint — no new API, no new
   *  table. Re-runs load() on success so joinRequests picks up the new
   *  pending row, which is what makes the outer "pendingRequest" branch
   *  above automatically take over and show "Request pending". */
  async function sendInlineJoinRequest(academy: AcademyCardResult) {
    setSendingJoinRequest(true);
    try {
      await api.post(`/marketplace/academies/${academy.slug}/join-requests`, {});
      toast({ title: `Request sent to ${academy.name}.`, variant: 'success' });
      await load();
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : 'Could not send your request',
        variant: 'error',
      });
    } finally {
      setSendingJoinRequest(false);
    }
  }

  function startEditing() {
    setForm(profile ? toForm(profile) : EMPTY_FORM);
    setError(null);
    setEditing(true);
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await api.put('/profiles/tutor', {
        displayName: form.displayName,
        headline: form.headline || undefined,
        bio: form.bio || undefined,
        yearsExperience: form.yearsExperience ? Number(form.yearsExperience) : undefined,
        qualifications: form.qualifications || undefined,
        languages: form.languages
          ? form.languages.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined,
        teachingMode: form.teachingMode || undefined,
        methodology: form.methodology || undefined,
        achievements: form.achievements || undefined,
        certifications: form.certifications || undefined,
        feeNote: form.feeNote || undefined,
      });
      await load();
      setEditing(false);
      toast({ title: 'Profile saved', variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File) {
    if (!ALLOWED_AVATAR_MIMES.includes(file.type)) {
      setError('Please upload a JPEG, PNG, or WEBP image.');
      return;
    }
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      setError(`That photo is too large — the maximum size is ${MAX_AVATAR_MB}MB.`);
      return;
    }
    setError(null);
    setLocalPreview(URL.createObjectURL(file));
    setUploadingAvatar(true);
    try {
      const { upload } = await api.post<{
        upload: { uploadUrl: string; headers?: Record<string, string> };
      }>('/profiles/tutor/avatar-upload-url', { mime: file.type, sizeBytes: file.size });
      const res = await fetch(upload.uploadUrl, { method: 'PUT', headers: upload.headers, body: file });
      if (!res.ok) throw new Error('Upload failed');
      await load();
      toast({ title: 'Photo updated', variant: 'success' });
    } catch {
      setError('Could not upload that photo. Try again.');
    } finally {
      setUploadingAvatar(false);
      setLocalPreview(null);
    }
  }

  async function removeAvatar() {
    setUploadingAvatar(true);
    try {
      await api.delete('/profiles/tutor/avatar');
      await load();
      toast({ title: 'Photo removed', variant: 'success' });
    } catch {
      toast({ title: 'Could not remove photo', variant: 'error' });
    } finally {
      setUploadingAvatar(false);
    }
  }

  function subjectName(subjectId: string): string {
    return subjects.find((s) => s.id === subjectId)?.name_i18n.en ?? 'Subject';
  }

  const avatarUrl = localPreview ?? profile?.avatarUrl ?? null;

  const completenessItems: CompletenessItem[] = [
    { key: 'basic', label: 'Basic information', done: !!profile?.display_name && !!profile?.headline },
    { key: 'photo', label: 'Profile photo', done: !!profile?.avatarUrl },
    { key: 'bio', label: 'Teaching bio', done: !!profile?.bio },
    { key: 'subjects', label: 'Subjects & rates', done: tutorSubjects.length > 0, href: '/dashboard/subjects' },
    {
      key: 'availability',
      label: 'Availability',
      done: (availabilityCount ?? 0) > 0,
      href: '/dashboard/availability',
    },
    { key: 'location', label: 'Location', done: !!location, href: '/dashboard/marketplace' },
    { key: 'qualifications', label: 'Qualifications', done: !!profile?.qualifications },
    {
      key: 'verification',
      label: 'Verification',
      done: profile?.verification_status === 'verified',
      href: '/dashboard/verification',
    },
  ];

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        eyebrow="Teaching"
        title="Teacher Profile"
        description="Your public profile — this is what students and parents see in Find a Teacher."
        action={
          !editing && profile ? (
            <div className="flex items-center gap-2">
              {profile.slug && (
                <a
                  href={`/t/${profile.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  View public page
                </a>
              )}
              <Button variant="secondary" size="sm" onClick={startEditing}>
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                Edit profile
              </Button>
            </div>
          ) : undefined
        }
      />

      {error && <InlineError>{error}</InlineError>}

      {loadError ? (
        <ErrorState
          description="Could not load your teacher profile. Check your connection and try again."
          onRetry={() => void load()}
        />
      ) : profile === undefined ? (
        <div className="space-y-4">
          <CardSkeleton className="h-40 rounded-2xl" />
          <CardSkeleton className="h-56 rounded-2xl" />
        </div>
      ) : profile === null && !editing ? (
        (() => {
          const pendingRequest = joinRequests.find((r) => r.status === 'pending');
          const lastDeclined = !pendingRequest ? joinRequests.find((r) => r.status === 'rejected') : undefined;

          if (academies.length > 0) {
            return (
              <AcademicCard>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                  Teaching under
                </p>
                <div className="mb-4 flex flex-wrap gap-2">
                  {academies.map((a) => (
                    <span
                      key={a.id}
                      className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                    >
                      <School className="h-3.5 w-3.5" aria-hidden />
                      {a.name}
                    </span>
                  ))}
                </div>
                <p className="mb-3 text-sm text-neutral-500 dark:text-neutral-400">
                  Now let&apos;s set up your own public profile — every teacher keeps one, academy member or not.
                </p>
                <Button size="sm" onClick={startEditing}>
                  Set up profile
                </Button>
              </AcademicCard>
            );
          }

          if (pendingRequest) {
            return (
              <AcademicCard>
                <div className="mb-4 flex items-start gap-3">
                  <School className="mt-0.5 h-5 w-5 shrink-0 text-brand-500 dark:text-brand-300" aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      Request pending — {pendingRequest.academy_name}
                    </p>
                    <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                      You&apos;ll be notified once the academy responds. Meanwhile, let&apos;s set up your own
                      public profile.
                    </p>
                  </div>
                </div>
                <Button size="sm" onClick={startEditing}>
                  Set up profile
                </Button>
              </AcademicCard>
            );
          }

          if (academyChoiceOpen) {
            const needle = academyQuery.trim().toLowerCase();
            const matches =
              needle.length > 0 && academyPool
                ? academyPool.filter((a) => a.name.toLowerCase().includes(needle)).slice(0, 8)
                : [];
            const alreadyPendingHere = selectedAcademy
              ? joinRequests.some((r) => r.academy_slug === selectedAcademy.slug && r.status === 'pending')
              : false;

            return (
              <AcademicCard>
                <div className="flex items-start gap-3">
                  <School className="mt-0.5 h-5 w-5 shrink-0 text-brand-500 dark:text-brand-300" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      Connect to an Academy
                    </p>
                    <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                      Search for an academy and request to join. You&apos;ll remain an independent teacher
                      throughout.
                    </p>
                    {lastDeclined && !selectedAcademy && (
                      <p className="mt-2 rounded-md bg-neutral-50 p-3 text-sm text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
                        Your request to join {lastDeclined.academy_name} was declined. You can request again.
                      </p>
                    )}

                    {selectedAcademy ? (
                      <div className="mt-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                            {academyInitials(selectedAcademy.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                                {selectedAcademy.name}
                              </p>
                              {selectedAcademy.verificationStatus === 'verified' && (
                                <StatusBadge status="verified" />
                              )}
                            </div>
                            {selectedAcademy.tagline && (
                              <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                                {selectedAcademy.tagline}
                              </p>
                            )}
                            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-400 dark:text-neutral-500">
                              {selectedAcademy.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" aria-hidden />
                                  {selectedAcademy.location.city}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" aria-hidden />
                                {selectedAcademy.teacherCount} teacher
                                {selectedAcademy.teacherCount === 1 ? '' : 's'}
                              </span>
                              {selectedAcademy.rating.average != null && (
                                <span className="flex items-center gap-1">
                                  <Star className="h-3 w-3 fill-accent-400 text-accent-400" aria-hidden />
                                  {selectedAcademy.rating.average}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          {alreadyPendingHere ? (
                            <Badge variant="brand">Request Pending</Badge>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => void sendInlineJoinRequest(selectedAcademy)}
                              disabled={sendingJoinRequest}
                            >
                              {sendingJoinRequest ? 'Sending…' : 'Connect / Request to Join'}
                            </Button>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedAcademy(null)}
                            className="text-sm font-medium text-neutral-500 hover:underline dark:text-neutral-400"
                          >
                            ← Choose a different academy
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="mt-3">
                          <Field label="Search Academy by name">
                            <Input
                              value={academyQuery}
                              onChange={(e) => setAcademyQuery(e.target.value)}
                              placeholder="e.g. Bright Future Academy"
                              autoFocus
                            />
                          </Field>
                        </div>
                        {academyPoolLoading && (
                          <p className="mt-2 text-sm text-neutral-400 dark:text-neutral-500">
                            Loading academies…
                          </p>
                        )}
                        {academyPoolError && (
                          <p className="mt-2 text-sm text-error dark:text-error-dark">
                            Could not load academies.{' '}
                            <button type="button" onClick={loadAcademyPool} className="underline">
                              Retry
                            </button>
                          </p>
                        )}
                        {needle.length > 0 &&
                          !academyPoolLoading &&
                          !academyPoolError &&
                          (matches.length > 0 ? (
                            <ul className="mt-2 divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                              {matches.map((a) => (
                                <li key={a.academyId}>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedAcademy(a)}
                                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"
                                  >
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                                      {academyInitials(a.name)}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate font-medium text-neutral-900 dark:text-neutral-50">
                                        {a.name}
                                      </span>
                                      {a.location && (
                                        <span className="block truncate text-xs text-neutral-400 dark:text-neutral-500">
                                          {a.location.city}
                                        </span>
                                      )}
                                    </span>
                                    {a.verificationStatus === 'verified' && <StatusBadge status="verified" />}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 text-sm text-neutral-400 dark:text-neutral-500">
                              No academies match &quot;{academyQuery.trim()}&quot;.
                            </p>
                          ))}
                        <button
                          type="button"
                          onClick={() => {
                            setAcademyChoiceOpen(false);
                            setAcademyQuery('');
                          }}
                          className="mt-3 text-sm font-medium text-neutral-500 hover:underline dark:text-neutral-400"
                        >
                          ← Back
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="mt-4 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    You can set up your own public profile now, or come back to it later.
                  </p>
                  <Button size="sm" variant="secondary" className="mt-2" onClick={startEditing}>
                    Set up profile now
                  </Button>
                </div>
              </AcademicCard>
            );
          }

          return (
            <AcademicCard>
              <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
                How do you teach? You can change this anytime from your Teacher Profile.
              </p>
              <div className="flex items-start gap-3">
                <UserCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-500 dark:text-brand-300" aria-hidden />
                <div className="flex-1">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    Individual / Independent Teacher
                  </p>
                  <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                    Set up your own public profile — this is what students and parents see in Find a Teacher.
                  </p>
                  <Button size="sm" className="mt-2" onClick={startEditing}>
                    Set up profile
                  </Button>
                </div>
              </div>
              <div className="mt-4 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                <div className="flex items-start gap-3">
                  <School className="mt-0.5 h-5 w-5 shrink-0 text-brand-500 dark:text-brand-300" aria-hidden />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      I teach under an Academy
                    </p>
                    <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                      Connect to an academy — you&apos;ll remain an individual teacher while becoming a member.
                    </p>
                    {lastDeclined && (
                      <p className="mt-2 rounded-md bg-neutral-50 p-3 text-sm text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
                        Your request to join {lastDeclined.academy_name} was declined. You can request again.
                      </p>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-2"
                      onClick={() => {
                        setAcademyChoiceOpen(true);
                        setSelectedAcademy(null);
                        setAcademyQuery('');
                        if (academyPool === null) loadAcademyPool();
                      }}
                    >
                      <Search className="h-3.5 w-3.5" aria-hidden />
                      Search Academy
                    </Button>
                  </div>
                </div>
              </div>
            </AcademicCard>
          );
        })()
      ) : editing ? (
        <AcademicCard>
          <div className="mb-5 flex flex-wrap items-center gap-4">
            <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-lg font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                initials(form.displayName || 'Teacher')
              )}
            </div>
            <div className="min-w-0 flex-1">
              <label>
                <span className="sr-only">Upload photo</span>
                <input
                  type="file"
                  accept={ALLOWED_AVATAR_MIMES.join(',')}
                  disabled={uploadingAvatar}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadAvatar(file);
                  }}
                  className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-700 dark:text-neutral-400 dark:file:bg-brand-500 dark:file:text-neutral-950 dark:hover:file:bg-brand-400"
                />
              </label>
              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                <p className="text-xs text-neutral-400 dark:text-neutral-500">
                  JPEG, PNG, or WEBP · Max {MAX_AVATAR_MB}MB
                </p>
                {profile?.avatarUrl && (
                  <button
                    type="button"
                    onClick={() => void removeAvatar()}
                    disabled={uploadingAvatar}
                    className="flex items-center gap-1 text-xs font-medium text-error hover:underline dark:text-error-dark"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required>
              <Input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                placeholder="Your name"
              />
            </Field>
            <Field label="Teaching title" hint="A short line under your name">
              <Input
                value={form.headline}
                onChange={(e) => setForm({ ...form, headline: e.target.value })}
                placeholder="e.g. Physics tutor for grades 9-12"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Bio" hint="Tell students and parents about yourself">
                <Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={4} />
              </Field>
            </div>
            <Field label="Years of teaching experience">
              <Input
                type="number"
                min={0}
                max={60}
                value={form.yearsExperience}
                onChange={(e) => setForm({ ...form, yearsExperience: e.target.value })}
              />
            </Field>
            <Field label="Teaching mode">
              <Select
                value={form.teachingMode}
                onChange={(e) => setForm({ ...form, teachingMode: e.target.value as TeachingMode | '' })}
              >
                <option value="">Not set</option>
                <option value="online">Online</option>
                <option value="offline">In-person</option>
                <option value="both">Both</option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Educational qualifications">
                <Textarea
                  value={form.qualifications}
                  onChange={(e) => setForm({ ...form, qualifications: e.target.value })}
                  rows={2}
                  placeholder="e.g. M.Sc Physics, B.Ed"
                />
              </Field>
            </div>
            <Field label="Languages spoken" hint="Comma-separated">
              <Input
                value={form.languages}
                onChange={(e) => setForm({ ...form, languages: e.target.value })}
                placeholder="English, Tamil"
              />
            </Field>
            <Field label="Fee note" hint="A short summary, e.g. batch discounts">
              <Input
                value={form.feeNote}
                onChange={(e) => setForm({ ...form, feeNote: e.target.value })}
                placeholder="Starting from ₹500/session"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Teaching methodology">
                <Textarea
                  value={form.methodology}
                  onChange={(e) => setForm({ ...form, methodology: e.target.value })}
                  rows={2}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Achievements">
                <Textarea
                  value={form.achievements}
                  onChange={(e) => setForm({ ...form, achievements: e.target.value })}
                  rows={2}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Certifications">
                <Textarea
                  value={form.certifications}
                  onChange={(e) => setForm({ ...form, certifications: e.target.value })}
                  rows={2}
                />
              </Field>
            </div>
          </div>

          <p className="mt-4 text-xs text-neutral-400 dark:text-neutral-500">
            Subjects &amp; rates, availability, and location are managed on their own pages and shown read-only
            below.
          </p>

          <div className="mt-5 flex gap-2">
            <Button onClick={() => void save()} disabled={saving || !form.displayName} loading={saving}>
              {saving ? 'Saving…' : 'Save profile'}
            </Button>
            {profile && (
              <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
            )}
          </div>
        </AcademicCard>
      ) : (
        profile && (
          <>
            <CompletenessCard
              title="Your profile"
              items={completenessItems}
              action={
                <Button variant="secondary" size="sm" onClick={startEditing}>
                  Complete profile
                </Button>
              }
            />

            <ProfileSection eyebrow="Who you are" title="Profile">
              <div className="flex flex-wrap items-start gap-5">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 font-display text-lg font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                  {profile.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initials(profile.display_name)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
                      {profile.display_name}
                    </p>
                    {profile.verification_status === 'verified' && <StatusBadge status="verified" />}
                  </div>
                  <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-300">
                    {profile.headline ?? (
                      <span className="text-neutral-400 dark:text-neutral-500">No teaching title yet</span>
                    )}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" aria-hidden />
                      {location
                        ? `${location.area_label ? `${location.area_label}, ` : ''}${location.city}`
                        : 'Location not set'}
                    </span>
                    {profile.languages && profile.languages.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Languages className="h-3 w-3" aria-hidden />
                        {profile.languages.join(', ')}
                      </span>
                    )}
                    {profile.years_experience != null && (
                      <span className="flex items-center gap-1">
                        <Award className="h-3 w-3" aria-hidden />
                        {profile.years_experience} years teaching
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {profile.bio ? (
                <p className="mt-5 whitespace-pre-line border-t border-neutral-100 pt-4 text-sm leading-relaxed text-neutral-700 dark:border-neutral-800 dark:text-neutral-300">
                  {profile.bio}
                </p>
              ) : (
                <div className="mt-5 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                  <TeacherEmptyState
                    icon={UserCircle}
                    title="No bio yet"
                    description="A few lines about how you teach is the first thing parents read."
                    action={
                      <Button variant="secondary" size="sm" onClick={startEditing}>
                        Add bio
                      </Button>
                    }
                  />
                </div>
              )}
            </ProfileSection>

            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard
                icon={Award}
                label="Proof-of-Teaching"
                value={proofOfTeaching?.score ?? '—'}
                hint="System-calculated"
                href="/dashboard/marketplace"
              />
              <MetricCard
                icon={Star}
                label="Rating"
                value={
                  rating?.average ?? <span className="text-neutral-400 dark:text-neutral-500">—</span>
                }
                hint={rating ? `${rating.count} student review${rating.count === 1 ? '' : 's'}` : 'From student reviews'}
              />
              <MetricCard
                icon={Users}
                label="Students taught"
                value={proofOfTeaching?.studentsTaught ?? '—'}
                hint="System-calculated"
                href="/dashboard/students"
              />
            </div>

            <ProfileSection eyebrow="What you teach" title="Teaching">
              <dl className="divide-y divide-neutral-100 dark:divide-neutral-800">
                <DetailRow
                  label="Teaching mode"
                  value={
                    profile.teaching_mode ? (
                      TEACHING_MODE_LABEL[profile.teaching_mode]
                    ) : (
                      <span className="text-neutral-400 dark:text-neutral-500">Not set</span>
                    )
                  }
                />
                <DetailRow
                  label="Hourly rate"
                  value={
                    tutorSubjects.length === 0 ? (
                      <span className="text-neutral-400 dark:text-neutral-500">No subjects yet</span>
                    ) : (
                      `From ${formatMinor(
                        Math.min(...tutorSubjects.map((t) => t.hourly_rate_minor)),
                        tutorSubjects[0].currency,
                      )}/hr`
                    )
                  }
                />
                <DetailRow
                  label="Availability"
                  value={
                    availabilityCount === null ? (
                      '—'
                    ) : availabilityCount === 0 ? (
                      <span className="text-neutral-400 dark:text-neutral-500">Not set</span>
                    ) : (
                      `${availabilityCount} weekly window${availabilityCount === 1 ? '' : 's'}`
                    )
                  }
                />
                {profile.fee_note && <DetailRow label="Fee note" value={profile.fee_note} />}
              </dl>

              <div className="mt-4 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
                    Subjects & curriculum
                  </p>
                  <Link
                    href="/dashboard/subjects"
                    className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
                  >
                    Manage
                  </Link>
                </div>
                {tutorSubjects.length === 0 ? (
                  <TeacherEmptyState
                    icon={BookMarked}
                    title="No subjects added yet"
                    description="Add subjects and rates so students can find and book you."
                    action={
                      <Link
                        href="/dashboard/subjects"
                        className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                      >
                        Add subject
                      </Link>
                    }
                  />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {tutorSubjects.map((ts) => (
                      <Badge key={ts.id} variant="neutral">
                        {subjectName(ts.subject_id)} · Grades {ts.grade_min}-{ts.grade_max} ·{' '}
                        {formatMinor(ts.hourly_rate_minor, ts.currency)}/hr
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {profile.methodology && (
                <div className="mt-4 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                  <LongText label="Teaching methodology" value={profile.methodology} />
                </div>
              )}
            </ProfileSection>

            <ProfileSection eyebrow="Credentials" title="Qualifications">
              {profile.qualifications || profile.certifications || profile.achievements ? (
                <div className="space-y-4">
                  {profile.qualifications && <LongText label="Qualifications" value={profile.qualifications} />}
                  {profile.certifications && <LongText label="Certifications" value={profile.certifications} />}
                  {profile.achievements && <LongText label="Achievements" value={profile.achievements} />}
                </div>
              ) : (
                <TeacherEmptyState
                  icon={Award}
                  title="No qualifications added"
                  description="Degrees, certifications, and achievements build trust before a first message."
                  action={
                    <Button variant="secondary" size="sm" onClick={startEditing}>
                      Add qualifications
                    </Button>
                  }
                />
              )}
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                <StatusBadge status={profile.verification_status} />
                <p className="min-w-0 flex-1 text-sm text-neutral-500 dark:text-neutral-400">
                  {profile.verification_status === 'verified'
                    ? 'Your documents are approved — students see a verified badge.'
                    : 'Upload your ID and a qualification certificate to earn a verified badge.'}
                </p>
                <Link
                  href="/dashboard/verification"
                  className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                >
                  Verification
                </Link>
              </div>
            </ProfileSection>

            <ProfileSection eyebrow="How you operate" title="Teaching arrangement">
              {academies.length > 0 ? (
                <>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                    Teaching under
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {academies.map((a) => (
                      <Link
                        key={a.id}
                        href={`/dashboard/find-an-academy/${a.slug}`}
                        className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-700 transition-colors hover:bg-brand-50 hover:text-brand-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-brand-500/15 dark:hover:text-brand-200"
                      >
                        <School className="h-3.5 w-3.5" aria-hidden />
                        {a.name}
                      </Link>
                    ))}
                  </div>
                  <Link
                    href="/dashboard/find-an-academy"
                    className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
                  >
                    <Search className="h-3.5 w-3.5" aria-hidden />
                    Connect to another Academy
                  </Link>
                </>
              ) : (
                (() => {
                  const pendingRequest = joinRequests.find((r) => r.status === 'pending');
                  const lastDeclined = !pendingRequest
                    ? joinRequests.find((r) => r.status === 'rejected')
                    : undefined;
                  if (pendingRequest) {
                    return (
                      <div className="flex items-start gap-3">
                        <School className="mt-0.5 h-5 w-5 shrink-0 text-brand-500 dark:text-brand-300" aria-hidden />
                        <div>
                          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                            Request pending — {pendingRequest.academy_name}
                          </p>
                          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                            You&apos;ll be notified once the academy responds. You&apos;ll remain an independent
                            teacher in the meantime.
                          </p>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <>
                      <div className="flex items-start gap-3">
                        <UserCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-500 dark:text-brand-300" aria-hidden />
                        <div>
                          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                            Individual / Independent Teacher
                          </p>
                          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                            You are currently teaching independently.
                          </p>
                        </div>
                      </div>
                      {lastDeclined && (
                        <p className="mt-3 rounded-md bg-neutral-50 p-3 text-sm text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
                          Your request to join {lastDeclined.academy_name} was declined. You can request again.
                        </p>
                      )}
                      <div className="mt-4 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                          I teach under an Academy
                        </p>
                        <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                          Connect to an academy — you&apos;ll remain an individual teacher while becoming a member.
                        </p>
                        <Link href="/dashboard/find-an-academy" className="mt-2 inline-block">
                          <Button size="sm" variant="secondary">
                            <Search className="h-3.5 w-3.5" aria-hidden />
                            Search Academy
                          </Button>
                        </Link>
                      </div>
                    </>
                  );
                })()
              )}
            </ProfileSection>

            <section>
              <SectionHeader
                eyebrow="Open to join"
                title="Available batches"
                action={{ href: '/dashboard/batches', label: 'Manage' }}
                className="mb-3"
              />
              {openBatches.length === 0 ? (
                <TeacherEmptyState
                  icon={CalendarClock}
                  title="No open batches"
                  description="Batches you're running with seats available show here automatically, and on your public page."
                  action={
                    <Link href="/dashboard/batches" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                      Batches
                    </Link>
                  }
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {openBatches.map((b) => (
                    <AcademicCard key={b.id} className="p-4">
                      <p className="truncate font-medium text-neutral-900 dark:text-neutral-50">{b.title}</p>
                      <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                        {subjectName(b.subject_id)} · {Math.max(0, b.capacity - Number(b.enrolled_count))} seats
                        left · {formatMinor(b.fee_minor, b.currency)}
                      </p>
                    </AcademicCard>
                  ))}
                </div>
              )}
            </section>
          </>
        )
      )}
    </div>
  );
}
