'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Download, Trash2, Check, AlertTriangle } from 'lucide-react';
import { api, tokenStore } from '@/lib/api';
import type { TutorProfile } from '@/lib/types';
import {
  Button,
  Field,
  Input,
  Textarea,
  StatusBadge,
  InlineError,
  CardSkeleton,
  ErrorState,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogFooter,
  useToast,
} from '@/components/ui';
import { TeacherPageHeader, AcademicCard } from '@/components/dashboard';

export default function ProfilePage() {
  const router = useRouter();
  const toast = useToast();
  const [profile, setProfile] = useState<TutorProfile | null | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState({ displayName: '', headline: '', bio: '', yearsExperience: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(false);
    api
      .get<TutorProfile | null>('/profiles/tutor/me')
      .then((row) => {
        setProfile(row);
        if (row) {
          setForm({
            displayName: row.display_name,
            headline: row.headline ?? '',
            bio: row.bio ?? '',
            yearsExperience: row.years_experience?.toString() ?? '',
          });
        }
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const updated = await api.put<TutorProfile>('/profiles/tutor', {
        displayName: form.displayName,
        headline: form.headline || undefined,
        bio: form.bio || undefined,
        yearsExperience: form.yearsExperience ? Number(form.yearsExperience) : undefined,
      });
      setProfile(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast({ title: 'Profile saved', variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  /** DPDP data-principal export right (blueprint §4/§9) — downloads the raw JSON. */
  async function exportData() {
    setExportError(null);
    setExporting(true);
    try {
      const data = await api.get('/account/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tuition-app-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not export your data.');
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    setDeleteError(null);
    setDeleting(true);
    try {
      await api.delete('/account/me');
      tokenStore.clear();
      router.replace('/login');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete your account.');
      setDeleting(false);
    }
  }

  return (
    <div>
      <TeacherPageHeader
        eyebrow="Account"
        title="Account"
        description="Your name and basic details, plus your data export and account deletion controls."
      />

      <div className="mt-8">
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
          Your full public listing — photo, qualifications, teaching mode, and methodology — lives on your{' '}
          <Link
            href="/dashboard/teacher-profile"
            className="font-medium text-brand-600 hover:underline dark:text-brand-300"
          >
            Teacher Profile
          </Link>
          .
        </p>
      {loadError ? (
        <ErrorState description="Could not load your profile. Check your connection and try again." onRetry={load} />
      ) : profile === undefined ? (
        <div className="max-w-2xl">
          <CardSkeleton />
        </div>
      ) : (
        <>
          <AcademicCard className="max-w-2xl">
            {profile && (
              <div className="mb-6 flex items-center gap-3 border-b border-neutral-100 pb-4 dark:border-neutral-800">
                <StatusBadge status={profile.verification_status} />
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {profile.verification_status === 'verified'
                    ? 'Your profile is verified.'
                    : 'Verification is reviewed within 24 hours.'}
                </p>
              </div>
            )}

            <div className="grid gap-4">
              <Field label="Display name">
                <Input
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  placeholder="Priya Sharma"
                />
              </Field>
              <Field label="Headline">
                <Input
                  value={form.headline}
                  onChange={(e) => setForm({ ...form, headline: e.target.value })}
                  placeholder="Physics & Maths, Grades 9–12"
                />
              </Field>
              <Field label="About you">
                <Textarea
                  rows={4}
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                />
              </Field>
              <Field label="Years of experience">
                <Input
                  type="number"
                  value={form.yearsExperience}
                  onChange={(e) => setForm({ ...form, yearsExperience: e.target.value })}
                />
              </Field>
            </div>

            {error && (
              <div className="mt-3">
                <InlineError>{error}</InlineError>
              </div>
            )}

            <div className="mt-6 flex items-center gap-3">
              <Button onClick={() => void save()} disabled={!form.displayName || saving} loading={saving}>
                {saving ? 'Saving…' : 'Save profile'}
              </Button>
              {saved && (
                <span className="flex items-center gap-1 text-sm text-success dark:text-success-dark">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  Saved
                </span>
              )}
            </div>
          </AcademicCard>

          <AcademicCard className="mt-6 max-w-2xl border-error/20 dark:border-error/25">
            <h2 className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">Your data</h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Export everything the app has on you, or permanently delete your account.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={() => void exportData()} disabled={exporting} loading={exporting}>
                <Download className="h-4 w-4" aria-hidden />
                {exporting ? 'Preparing export…' : 'Export my data'}
              </Button>

              <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogTrigger asChild>
                  <Button variant="danger">
                    <Trash2 className="h-4 w-4" aria-hidden />
                    Delete my account
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error-bg dark:bg-error/15">
                      <AlertTriangle className="h-5 w-5 text-error dark:text-error-dark" aria-hidden />
                    </div>
                    <div>
                      <h3 className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                        Delete your account?
                      </h3>
                      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                        This permanently deletes your account and signs you out everywhere. Your
                        batches, attendance and fee records are kept for other people they belong to,
                        but your contact details are removed and you can never sign back in with this
                        number.
                      </p>
                    </div>
                  </div>
                  {deleteError && (
                    <div className="mt-3">
                      <InlineError>{deleteError}</InlineError>
                    </div>
                  )}
                  <DialogFooter className="mt-5">
                    <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={deleting}>
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => void deleteAccount()}
                      disabled={deleting}
                      loading={deleting}
                    >
                      {deleting ? 'Deleting…' : 'Yes, permanently delete my account'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            {exportError && (
              <div className="mt-3">
                <InlineError>{exportError}</InlineError>
              </div>
            )}
          </AcademicCard>
        </>
      )}
      </div>
    </div>
  );
}
