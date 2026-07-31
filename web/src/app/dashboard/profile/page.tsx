'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { TutorProfile } from '@/lib/types';
import { Card, PageHeader, Button, Field, inputClass, StatusBadge } from '@/components/ui';

export default function ProfilePage() {
  const [profile, setProfile] = useState<TutorProfile | null>(null);
  const [form, setForm] = useState({ displayName: '', headline: '', bio: '', yearsExperience: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    </div>
  );
}
