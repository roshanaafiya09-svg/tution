'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Award,
  BookMarked,
  CalendarClock,
  MapPin,
  Pencil,
  School,
  Search,
  Star,
  Trash2,
  Users,
  UserCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import type {
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
import {
  Badge,
  Button,
  CardSkeleton,
  CardTitle,
  ErrorState,
  Field,
  InlineError,
  Input,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '@/components/ui';
import { TeacherPageHeader, AcademicCard, SectionHeader, TeacherEmptyState } from '@/components/dashboard';

const ALLOWED_AVATAR_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_AVATAR_MB = 5;

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

  return (
    <div>
      <TeacherPageHeader
        eyebrow="Teaching profile"
        title="Teacher Profile"
        description="Your public profile — this is what students and parents see in Find a Teacher."
        action={
          !editing && profile ? (
            <Button variant="secondary" size="sm" onClick={startEditing}>
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit profile
            </Button>
          ) : undefined
        }
      />

      {error && (
        <div className="mb-4 mt-8">
          <InlineError>{error}</InlineError>
        </div>
      )}

      <div className="mt-8">
        {loadError ? (
          <ErrorState
            description="Could not load your teacher profile. Check your connection and try again."
            onRetry={() => void load()}
          />
        ) : profile === undefined ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : profile === null && !editing ? (
          <TeacherEmptyState
            icon={UserCircle}
            title="Set up your public profile"
            description="Add a photo and details so students and parents can find and get to know you in Find a Teacher."
            action={
              <Button size="sm" onClick={startEditing}>
                Set up profile
              </Button>
            }
          />
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
                    className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-700 dark:text-neutral-400 dark:file:bg-brand-500 dark:hover:file:bg-brand-400"
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
              <Field label="Headline" hint="A short line under your name">
                <Input
                  value={form.headline}
                  onChange={(e) => setForm({ ...form, headline: e.target.value })}
                  placeholder="e.g. Physics tutor for grades 9-12"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="About" hint="Tell students and parents about yourself">
                  <Textarea
                    value={form.bio}
                    onChange={(e) => setForm({ ...form, bio: e.target.value })}
                    rows={4}
                  />
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
                  <option value="offline">Offline</option>
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
              Subjects &amp; rates, availability, and location are managed on their own pages and shown
              read-only below.
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
              <AcademicCard className="mb-6">
                <div className="flex flex-wrap items-start gap-5">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-lg font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                    {profile.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      initials(profile.display_name)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-xl font-semibold text-neutral-900 dark:text-neutral-50">
                        {profile.display_name}
                      </p>
                      {profile.verification_status === 'verified' && <StatusBadge status="verified" />}
                    </div>
                    {profile.headline && (
                      <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{profile.headline}</p>
                    )}
                    {location && (
                      <p className="mt-1.5 flex items-center gap-1 text-xs text-neutral-400 dark:text-neutral-500">
                        <MapPin className="h-3 w-3" aria-hidden />
                        {location.area_label ? `${location.area_label}, ` : ''}
                        {location.city}
                      </p>
                    )}
                  </div>
                </div>
                {profile.bio && (
                  <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {profile.bio}
                  </p>
                )}
                <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  {profile.years_experience != null && (
                    <div className="flex justify-between">
                      <dt className="text-neutral-500 dark:text-neutral-400">Experience</dt>
                      <dd className="text-neutral-900 dark:text-neutral-100">{profile.years_experience} years</dd>
                    </div>
                  )}
                  {profile.teaching_mode && (
                    <div className="flex justify-between">
                      <dt className="text-neutral-500 dark:text-neutral-400">Teaching mode</dt>
                      <dd className="capitalize text-neutral-900 dark:text-neutral-100">{profile.teaching_mode}</dd>
                    </div>
                  )}
                  {profile.languages && profile.languages.length > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-neutral-500 dark:text-neutral-400">Languages</dt>
                      <dd className="text-neutral-900 dark:text-neutral-100">{profile.languages.join(', ')}</dd>
                    </div>
                  )}
                  {profile.fee_note && (
                    <div className="flex justify-between">
                      <dt className="text-neutral-500 dark:text-neutral-400">Fee</dt>
                      <dd className="text-neutral-900 dark:text-neutral-100">{profile.fee_note}</dd>
                    </div>
                  )}
                </dl>
                {[
                  ['Qualifications', profile.qualifications],
                  ['Teaching methodology', profile.methodology],
                  ['Achievements', profile.achievements],
                  ['Certifications', profile.certifications],
                ]
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div key={label} className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                        {label}
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm text-neutral-700 dark:text-neutral-300">
                        {value}
                      </p>
                    </div>
                  ))}
              </AcademicCard>

              <SectionHeader title="Teaching Arrangement" />
              <AcademicCard className="mb-8">
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
                          🏫 {a.name}
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
                          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">I teach under an Academy</p>
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
              </AcademicCard>

              <div className="mb-8 grid gap-4 sm:grid-cols-3">
                <AcademicCard>
                  <div className="mb-1 flex items-center gap-2">
                    <Award className="h-4 w-4 text-brand-500 dark:text-brand-300" aria-hidden />
                    <CardTitle>Proof-of-Teaching</CardTitle>
                  </div>
                  <p className="font-display text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
                    {proofOfTeaching?.score ?? '—'}
                  </p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">System-calculated</p>
                </AcademicCard>
                <AcademicCard>
                  <div className="mb-1 flex items-center gap-2">
                    <Star className="h-4 w-4 fill-accent-400 text-accent-400" aria-hidden />
                    <CardTitle>Rating</CardTitle>
                  </div>
                  <p className="font-display text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
                    {rating?.average ?? '—'}
                    {rating && rating.average !== null && (
                      <span className="text-sm font-normal text-neutral-500 dark:text-neutral-400"> ({rating.count})</span>
                    )}
                  </p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">From student reviews</p>
                </AcademicCard>
                <AcademicCard>
                  <div className="mb-1 flex items-center gap-2">
                    <Users className="h-4 w-4 text-brand-500 dark:text-brand-300" aria-hidden />
                    <CardTitle>Students taught</CardTitle>
                  </div>
                  <p className="font-display text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
                    {proofOfTeaching?.studentsTaught ?? '—'}
                  </p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">System-calculated</p>
                </AcademicCard>
              </div>

              <SectionHeader
                title="Subjects & rates"
                action={{ href: '/dashboard/subjects', label: 'Manage' }}
              />
              {tutorSubjects.length === 0 ? (
                <TeacherEmptyState
                  icon={BookMarked}
                  title="No subjects added yet"
                  description="Add subjects and rates so students can find you."
                  className="mb-8"
                />
              ) : (
                <div className="mb-8 flex flex-wrap gap-2">
                  {tutorSubjects.map((ts) => (
                    <Badge key={ts.id} variant="neutral">
                      {subjectName(ts.subject_id)} · Grades {ts.grade_min}-{ts.grade_max}
                    </Badge>
                  ))}
                </div>
              )}

              <SectionHeader
                title="Available batches"
                action={{ href: '/dashboard/batches', label: 'Manage' }}
              />
              {openBatches.length === 0 ? (
                <TeacherEmptyState
                  icon={CalendarClock}
                  title="No open batches"
                  description="Batches you're running with seats available show here automatically."
                  className="mb-8"
                />
              ) : (
                <div className="mb-8 grid gap-3 sm:grid-cols-2">
                  {openBatches.map((b) => (
                    <AcademicCard key={b.id}>
                      <p className="font-medium text-neutral-900 dark:text-neutral-50">{b.title}</p>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        {subjectName(b.subject_id)} ·{' '}
                        {Math.max(0, b.capacity - Number(b.enrolled_count))} seats left
                      </p>
                    </AcademicCard>
                  ))}
                </div>
              )}

              <SectionHeader
                title="Availability"
                action={{ href: '/dashboard/availability', label: 'Manage' }}
              />
              <p className="mb-8 text-sm text-neutral-500 dark:text-neutral-400">
                {availabilityCount === null
                  ? '—'
                  : availabilityCount === 0
                    ? 'No weekly availability set yet.'
                    : `${availabilityCount} weekly time slot${availabilityCount === 1 ? '' : 's'} set.`}
              </p>

              <SectionHeader
                title="Location"
                action={{ href: '/dashboard/marketplace', label: 'Manage' }}
              />
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {location ? `${location.area_label ? `${location.area_label}, ` : ''}${location.city}` : 'Not set yet.'}
              </p>
            </>
          )
        )}
      </div>
    </div>
  );
}
