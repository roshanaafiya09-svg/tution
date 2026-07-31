'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, tokenStore } from '@/lib/api';
import type { TutorProfile } from '@/lib/types';
import { Card, PageHeader, Button, Field, inputClass, StatusBadge } from '@/components/ui';

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<TutorProfile | null>(null);
  const [form, setForm] = useState({ displayName: '', headline: '', bio: '', yearsExperience: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    void api.get<TutorProfile | null>('/profiles/tutor/me').then((row) => {
      setProfile(row);
      if (row) {
        setForm({
          displayName: row.display_name,
          headline: row.headline ?? '',
          bio: row.bio ?? '',
          yearsExperience: row.years_experience?.toString() ?? '',
        });
      }
    });
  }, []);

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
      <PageHeader title="Profile" description="This is what parents and students see." />

      <Card className="max-w-2xl">
        {profile && (
          <div className="mb-6 flex items-center gap-3 border-b border-neutral-100 pb-4">
            <StatusBadge status={profile.verification_status} />
            <p className="text-sm text-neutral-500">
              {profile.verification_status === 'verified'
                ? 'Your profile is verified.'
                : 'Verification is reviewed within 24 hours.'}
            </p>
          </div>
        )}

        <div className="grid gap-4">
          <Field label="Display name">
            <input
              className={inputClass}
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder="Priya Sharma"
            />
          </Field>
          <Field label="Headline">
            <input
              className={inputClass}
              value={form.headline}
              onChange={(e) => setForm({ ...form, headline: e.target.value })}
              placeholder="Physics & Maths, Grades 9–12"
            />
          </Field>
          <Field label="About you">
            <textarea
              className={inputClass}
              rows={4}
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
            />
          </Field>
          <Field label="Years of experience">
            <input
              type="number"
              className={inputClass}
              value={form.yearsExperience}
              onChange={(e) => setForm({ ...form, yearsExperience: e.target.value })}
            />
          </Field>
        </div>

        {error && <p className="mt-3 text-sm text-error">{error}</p>}

        <div className="mt-6 flex items-center gap-3">
          <Button onClick={() => void save()} disabled={!form.displayName || saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </Button>
          {saved && <span className="text-sm text-success">Saved</span>}
        </div>
      </Card>

      <Card className="mt-6 max-w-2xl border-error/20">
        <h2 className="font-display text-lg font-semibold text-neutral-900">Your data</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Export everything the app has on you, or permanently delete your account.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => void exportData()} disabled={exporting}>
            {exporting ? 'Preparing export…' : 'Export my data'}
          </Button>
          {!confirmingDelete && (
            <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
              Delete my account
            </Button>
          )}
        </div>
        {exportError && <p className="mt-3 text-sm text-error">{exportError}</p>}

        {confirmingDelete && (
          <div className="mt-4 rounded-md border border-error/30 bg-error/5 p-4">
            <p className="text-sm font-medium text-neutral-900">
              This permanently deletes your account and signs you out everywhere. Your batches,
              attendance and fee records are kept for other people they belong to, but your
              contact details are removed and you can never sign back in with this number.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <Button variant="danger" onClick={() => void deleteAccount()} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Yes, permanently delete my account'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
            </div>
            {deleteError && <p className="mt-3 text-sm text-error">{deleteError}</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
