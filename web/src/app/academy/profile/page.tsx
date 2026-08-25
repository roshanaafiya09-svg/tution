'use client';

import { useCallback, useEffect, useState } from 'react';
import { Globe, Mail, MapPin, Pencil, Phone } from 'lucide-react';
import { api } from '@/lib/api';
import { safeHref } from '@/lib/safe-url';
import type { AcademyAcademicInfo, AcademyOwnerProfile, TeachingMode } from '@/lib/types';
import {
  Badge,
  Button,
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
import { AcademyCard, AcademyPageIntro, AcademySectionHeader } from '@/components/academy';
import { academyInitials } from '@/lib/academies';
import { useAcademyDashboard } from '@/components/academy-shell';

interface FormState {
  name: string;
  tagline: string;
  description: string;
  methodology: string;
  yearsEstablished: string;
  achievements: string;
  certifications: string;
  teachingMode: TeachingMode | '';
  city: string;
  areaLabel: string;
  lat: string;
  lng: string;
  contactPhone: string;
  contactEmail: string;
  websiteUrl: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  tagline: '',
  description: '',
  methodology: '',
  yearsEstablished: '',
  achievements: '',
  certifications: '',
  teachingMode: '',
  city: '',
  areaLabel: '',
  lat: '',
  lng: '',
  contactPhone: '',
  contactEmail: '',
  websiteUrl: '',
};

function toForm(profile: AcademyOwnerProfile): FormState {
  return {
    name: profile.name,
    tagline: profile.tagline ?? '',
    description: profile.description ?? '',
    methodology: profile.methodology ?? '',
    yearsEstablished: profile.yearsEstablished != null ? String(profile.yearsEstablished) : '',
    achievements: profile.achievements ?? '',
    certifications: profile.certifications ?? '',
    teachingMode: profile.teachingMode ?? '',
    city: profile.location?.city ?? '',
    areaLabel: profile.location?.areaLabel ?? '',
    lat: profile.location?.lat != null ? String(profile.location.lat) : '',
    lng: profile.location?.lng != null ? String(profile.location.lng) : '',
    contactPhone: profile.contactPhone ?? '',
    contactEmail: profile.contactEmail ?? '',
    websiteUrl: profile.websiteUrl ?? '',
  };
}

/** Fields that count toward "Academy Profile — NN% complete" — purely a
 *  frontend nudge, no backend field for it. Logo/cover are checked
 *  separately from the rest since they're uploaded, not typed. */
function completionPercent(profile: AcademyOwnerProfile): number {
  const checks = [
    !!profile.name,
    !!profile.tagline,
    !!profile.description,
    !!profile.logoUrl,
    !!profile.coverUrl,
    !!profile.location,
    !!profile.contactPhone || !!profile.contactEmail,
    !!profile.teachingMode,
  ];
  const complete = checks.filter(Boolean).length;
  return Math.round((complete / checks.length) * 100);
}

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_MB = 5;

export default function AcademyProfilePage() {
  const toast = useToast();
  const { hasAcademy, markAcademyCreated } = useAcademyDashboard();
  const [profile, setProfile] = useState<AcademyOwnerProfile | null | undefined>(undefined);
  const [academicInfo, setAcademicInfo] = useState<AcademyAcademicInfo | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const load = useCallback(async () => {
    if (hasAcademy === false) return;
    setLoadError(false);
    try {
      const [res, academicRes] = await Promise.all([
        api.get<AcademyOwnerProfile>('/academy/me'),
        api.get<AcademyAcademicInfo>('/academy/me/academic-info').catch(() => null),
      ]);
      setProfile(res);
      setAcademicInfo(academicRes);
    } catch {
      setLoadError(true);
    }
  }, [hasAcademy]);

  useEffect(() => {
    void load();
  }, [load]);

  function startEditing() {
    if (profile) setForm(toForm(profile));
    setError(null);
    setEditing(true);
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await api.put('/academy/me/profile', {
        name: form.name,
        tagline: form.tagline || undefined,
        description: form.description || undefined,
        methodology: form.methodology || undefined,
        yearsEstablished: form.yearsEstablished ? Number(form.yearsEstablished) : undefined,
        achievements: form.achievements || undefined,
        certifications: form.certifications || undefined,
        teachingMode: form.teachingMode || undefined,
        city: form.city || undefined,
        areaLabel: form.areaLabel || undefined,
        lat: form.lat ? Number(form.lat) : undefined,
        lng: form.lng ? Number(form.lng) : undefined,
        contactPhone: form.contactPhone || undefined,
        contactEmail: form.contactEmail || undefined,
        websiteUrl: form.websiteUrl || undefined,
      });
      await load();
      setEditing(false);
      toast({ title: 'Academy profile saved', variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your academy profile.');
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(file: File, kind: 'logo' | 'cover') {
    if (!ALLOWED_MIMES.includes(file.type)) {
      toast({ title: 'Please upload a JPEG, PNG, or WEBP image.', variant: 'error' });
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      toast({ title: `That image is too large — max ${MAX_IMAGE_MB}MB.`, variant: 'error' });
      return;
    }
    const setUploading = kind === 'logo' ? setUploadingLogo : setUploadingCover;
    setUploading(true);
    try {
      const { upload } = await api.post<{ upload: { uploadUrl: string; headers?: Record<string, string> } }>(
        `/academy/me/${kind}-upload-url`,
        { mime: file.type, sizeBytes: file.size },
      );
      const res = await fetch(upload.uploadUrl, { method: 'PUT', headers: upload.headers, body: file });
      if (!res.ok) throw new Error('Upload failed');
      await load();
      toast({ title: `${kind === 'logo' ? 'Logo' : 'Cover image'} updated`, variant: 'success' });
    } catch {
      toast({ title: `Could not upload that ${kind === 'logo' ? 'logo' : 'cover image'}. Try again.`, variant: 'error' });
    } finally {
      setUploading(false);
    }
  }

  if (hasAcademy === false) {
    return (
      <CreateAcademyCard
        onCreated={() => {
          markAcademyCreated();
          void load();
        }}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        description="Could not load your academy profile. Check your connection and try again."
        onRetry={() => void load()}
      />
    );
  }

  if (profile === undefined) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const percentComplete = profile ? completionPercent(profile) : 0;

  return (
    <div>
      <AcademyPageIntro
        eyebrow="Academy Dashboard"
        title="Academy Profile"
        description={`This is what teachers and families see on Find an Academy. ${percentComplete}% complete.`}
        action={
          !editing && profile ? (
            <Button variant="secondary" size="sm" onClick={startEditing}>
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit profile
            </Button>
          ) : undefined
        }
      />

      {profile && !editing && (
        <div className="mt-4 h-1.5 max-w-md overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <div
            className="h-full rounded-full bg-brand-500 transition-all dark:bg-brand-400"
            style={{ width: `${percentComplete}%` }}
            role="progressbar"
            aria-valuenow={percentComplete}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Academy profile completeness"
          />
        </div>
      )}

      {error && (
        <div className="mb-4 mt-8">
          <InlineError>{error}</InlineError>
        </div>
      )}

      <div className="mt-8">
        {!profile ? null : editing ? (
          <AcademyCard>
            <div className="mb-5 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">Logo</p>
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                    {profile.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profile.logoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      academyInitials(profile.name)
                    )}
                  </div>
                  <label>
                    <span className="sr-only">Upload logo</span>
                    <input
                      type="file"
                      accept={ALLOWED_MIMES.join(',')}
                      disabled={uploadingLogo}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadImage(file, 'logo');
                      }}
                      className="block text-xs text-neutral-600 file:mr-2 file:rounded-md file:border-0 file:bg-brand-600 file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-white hover:file:bg-brand-700 dark:text-neutral-400 dark:file:bg-brand-500"
                    />
                  </label>
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">Cover image</p>
                <div className="flex items-center gap-3">
                  <div className="h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800">
                    {profile.coverUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profile.coverUrl} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <label>
                    <span className="sr-only">Upload cover image</span>
                    <input
                      type="file"
                      accept={ALLOWED_MIMES.join(',')}
                      disabled={uploadingCover}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadImage(file, 'cover');
                      }}
                      className="block text-xs text-neutral-600 file:mr-2 file:rounded-md file:border-0 file:bg-brand-600 file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-white hover:file:bg-brand-700 dark:text-neutral-400 dark:file:bg-brand-500"
                    />
                  </label>
                </div>
              </div>
            </div>

            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
              Basic information
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Academy name" required>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Tagline">
                <Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="About">
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} />
                </Field>
              </div>
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
              <Field label="Years established">
                <Input
                  type="number"
                  min={1900}
                  max={2100}
                  value={form.yearsEstablished}
                  onChange={(e) => setForm({ ...form, yearsEstablished: e.target.value })}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Teaching methodology">
                  <Textarea value={form.methodology} onChange={(e) => setForm({ ...form, methodology: e.target.value })} rows={2} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Achievements">
                  <Textarea value={form.achievements} onChange={(e) => setForm({ ...form, achievements: e.target.value })} rows={2} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Certifications">
                  <Textarea value={form.certifications} onChange={(e) => setForm({ ...form, certifications: e.target.value })} rows={2} />
                </Field>
              </div>
            </div>

            <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
              Location
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="City">
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </Field>
              <Field label="Area">
                <Input value={form.areaLabel} onChange={(e) => setForm({ ...form, areaLabel: e.target.value })} />
              </Field>
              <Field label="Latitude" hint="Required together with longitude to show on the map">
                <Input type="number" step="any" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
              </Field>
              <Field label="Longitude">
                <Input type="number" step="any" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
              </Field>
            </div>

            <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
              Contact information
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone">
                <Input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} placeholder="+91 98765 43210" />
              </Field>
              <Field label="Email">
                <Input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} placeholder="hello@youracademy.com" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Website" hint="Include https://">
                  <Input value={form.websiteUrl} onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })} placeholder="https://youracademy.com" />
                </Field>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <Button onClick={() => void save()} disabled={saving || !form.name} loading={saving}>
                {saving ? 'Saving…' : 'Save profile'}
              </Button>
              <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </AcademyCard>
        ) : (
          <>
            <AcademyCard>
              <div className="flex flex-wrap items-start gap-5">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 font-display text-xl font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                  {profile.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.logoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    academyInitials(profile.name)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{profile.name}</p>
                    <StatusBadge status={profile.verificationStatus} />
                  </div>
                  {profile.tagline && <p className="mt-1 text-neutral-600 dark:text-neutral-400">{profile.tagline}</p>}
                  {profile.location && (
                    <p className="mt-1.5 flex items-center gap-1 text-sm text-neutral-500 dark:text-neutral-500">
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      {profile.location.areaLabel ? `${profile.location.areaLabel}, ` : ''}
                      {profile.location.city}
                    </p>
                  )}
                </div>
              </div>
              {profile.description && (
                <p className="mt-6 whitespace-pre-line leading-relaxed text-neutral-700 dark:text-neutral-300">{profile.description}</p>
              )}
              {[
                ['Teaching methodology', profile.methodology],
                ['Achievements', profile.achievements],
                ['Certifications', profile.certifications],
              ]
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label} className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">{label}</p>
                    <p className="mt-1 whitespace-pre-line text-sm text-neutral-700 dark:text-neutral-300">{value}</p>
                  </div>
                ))}

              {(profile.contactPhone || profile.contactEmail || profile.websiteUrl) && (
                <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-neutral-100 pt-4 text-sm dark:border-neutral-800">
                  {profile.contactPhone && (
                    <span className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                      <Phone className="h-3.5 w-3.5 text-neutral-400" aria-hidden />
                      {profile.contactPhone}
                    </span>
                  )}
                  {profile.contactEmail && (
                    <span className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                      <Mail className="h-3.5 w-3.5 text-neutral-400" aria-hidden />
                      {profile.contactEmail}
                    </span>
                  )}
                  {profile.websiteUrl && safeHref(profile.websiteUrl) && (
                    <a
                      href={safeHref(profile.websiteUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-brand-600 hover:underline dark:text-brand-300"
                    >
                      <Globe className="h-3.5 w-3.5" aria-hidden />
                      {profile.websiteUrl.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                </div>
              )}
            </AcademyCard>

            <AcademySectionHeader title="Academic Information" className="mt-8" />
            <AcademyCard>
              <p className="mb-3 text-xs text-neutral-400 dark:text-neutral-500">
                Derived from what your active teachers currently teach — add subjects from each teacher&apos;s own profile.
              </p>
              {!academicInfo || academicInfo.subjects.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  No subjects yet — once your teachers add subjects to their own profiles, they&apos;ll show up here.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {academicInfo.subjects.map((s) => (
                    <Badge key={s.subjectId} variant="neutral">
                      {s.name} · Grades {s.gradeMin}–{s.gradeMax}
                    </Badge>
                  ))}
                </div>
              )}
            </AcademyCard>
          </>
        )}
      </div>
    </div>
  );
}

/** Self-serve signup's bootstrap step (see login-form.tsx's 'academy'-role
 *  signup and AcademyShell) — a fresh `academy`-role account has no
 *  `academies` row yet. This is the only place in the Academy Dashboard
 *  that ever renders the creation form — every other page shows
 *  `AcademySetupRequired` instead (see academy-shell.tsx). Posts straight
 *  to POST /academy/me (AcademyOwnerService.createMyAcademy) — everything
 *  else about the academy (description, subjects, location, photos...)
 *  is filled in afterward, right here on this page. */
function CreateAcademyCard({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSaving(true);
    try {
      await api.post('/academy/me', { name: name.trim() });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your academy.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <AcademyPageIntro
        eyebrow="Academy Dashboard"
        title="Set up your academy"
        description="Give your academy a name to get started — you can add a description, subjects, location, and photos afterward, right here."
      />
      <AcademyCard className="mt-8 max-w-md p-7">
        <Field label="Academy name" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bright Future Academy"
            autoFocus
            maxLength={200}
          />
        </Field>

        {error && (
          <div className="mt-3">
            <InlineError>{error}</InlineError>
          </div>
        )}

        <Button
          className="mt-5 w-full sm:w-auto"
          onClick={() => void submit()}
          disabled={saving || !name.trim()}
          loading={saving}
        >
          {saving ? 'Creating…' : 'Create Academy Profile'}
        </Button>
      </AcademyCard>
    </div>
  );
}
