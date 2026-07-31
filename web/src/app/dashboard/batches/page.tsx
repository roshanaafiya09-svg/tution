'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, formatMinor } from '@/lib/api';
import type { Batch, Curriculum, GradeLevel, Subject } from '@/lib/types';
import {
  Card,
  PageHeader,
  EmptyState,
  StatusBadge,
  Button,
  Field,
  inputClass,
} from '@/components/ui';

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: '',
    subjectId: '',
    curriculumId: '',
    gradeLevelId: '',
    capacity: '15',
    feeRupees: '1500',
  });

  useEffect(() => {
    void api.get<Batch[]>('/batches/me').then(setBatches);
    void api.get<Subject[]>('/catalog/subjects').then(setSubjects);
    void api.get<Curriculum[]>('/catalog/curricula').then(setCurricula);
  }, []);

  useEffect(() => {
    if (!form.curriculumId) {
      setGradeLevels([]);
      return;
    }
    void api
      .get<GradeLevel[]>(`/catalog/curricula/${form.curriculumId}/grade-levels`)
      .then(setGradeLevels);
  }, [form.curriculumId]);

  async function createBatch() {
    setError(null);
    setSaving(true);
    try {
      await api.post('/batches', {
        title: form.title,
        subjectId: form.subjectId,
        gradeLevelId: form.gradeLevelId,
        capacity: Number(form.capacity),
        feeMinor: Math.round(Number(form.feeRupees) * 100),
      });
      setBatches(await api.get<Batch[]>('/batches/me'));
      setShowForm(false);
      setForm({ ...form, title: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the batch.');
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = form.title && form.subjectId && form.gradeLevelId;

  return (
    <div>
      <PageHeader
        title="Batches"
        description="Each batch is a group you teach on a schedule."
        action={<Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : 'New batch'}</Button>}
      />

      {showForm && (
        <Card className="mb-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Batch name">
              <input
                className={inputClass}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Grade 10 Physics — Evening"
              />
            </Field>
            <Field label="Subject">
              <select
                className={inputClass}
                value={form.subjectId}
                onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
              >
                <option value="">Select a subject</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name_i18n.en}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Curriculum">
              <select
                className={inputClass}
                value={form.curriculumId}
                onChange={(e) => setForm({ ...form, curriculumId: e.target.value, gradeLevelId: '' })}
              >
                <option value="">Select a curriculum</option>
                {curricula.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Grade">
              <select
                className={inputClass}
                value={form.gradeLevelId}
                onChange={(e) => setForm({ ...form, gradeLevelId: e.target.value })}
                disabled={gradeLevels.length === 0}
              >
                <option value="">Select a grade</option>
                {gradeLevels.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Capacity">
              <input
                type="number"
                className={inputClass}
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              />
            </Field>
            <Field label="Monthly fee (₹)" hint="Stored in paise — no rounding errors.">
              <input
                type="number"
                className={inputClass}
                value={form.feeRupees}
                onChange={(e) => setForm({ ...form, feeRupees: e.target.value })}
              />
            </Field>
          </div>

          {error && <p className="mt-3 text-sm text-error">{error}</p>}

          <div className="mt-4">
            <Button onClick={() => void createBatch()} disabled={!canSubmit || saving}>
              {saving ? 'Creating…' : 'Create batch'}
            </Button>
          </div>
        </Card>
      )}

      {batches === null ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : batches.length === 0 ? (
        <EmptyState
          title="No batches yet"
          description="Create your first batch, then share the invite link on WhatsApp to bring your students in."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {batches.map((batch) => (
            <Link key={batch.id} href={`/dashboard/batches/${batch.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between">
                  <p className="font-medium text-neutral-900">{batch.title}</p>
                  <StatusBadge status={batch.status} />
                </div>
                <p className="mt-3 text-sm text-neutral-500">
                  Up to {batch.capacity} students · {formatMinor(batch.fee_minor, batch.currency)}/
                  {batch.fee_period === 'monthly' ? 'month' : batch.fee_period}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
