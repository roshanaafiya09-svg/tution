'use client';

import { useEffect, useState } from 'react';
import { api, formatMinor } from '@/lib/api';
import type { Curriculum, GradeLevel, Subject, TutorSubject } from '@/lib/types';
import { Card, PageHeader, EmptyState, Button, Field, inputClass } from '@/components/ui';

export default function SubjectsPage() {
  const [offerings, setOfferings] = useState<TutorSubject[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notifiedId, setNotifiedId] = useState<string | null>(null);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    subjectId: '',
    curriculumId: '',
    gradeMin: '1',
    gradeMax: '10',
    hourlyRateRupees: '500',
  });

  useEffect(() => {
    void api.get<TutorSubject[]>('/tutor-subjects/me').then(setOfferings);
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

  function subjectName(subjectId: string): string {
    return subjects.find((s) => s.id === subjectId)?.name_i18n.en ?? subjectId.slice(0, 8);
  }

  function curriculumName(curriculumId: string): string {
    return curricula.find((c) => c.id === curriculumId)?.name ?? curriculumId.slice(0, 8);
  }

  async function createOffering() {
    setError(null);
    setSaving(true);
    try {
      await api.post('/tutor-subjects', {
        subjectId: form.subjectId,
        curriculumId: form.curriculumId,
        gradeMin: Number(form.gradeMin),
        gradeMax: Number(form.gradeMax),
        hourlyRateMinor: Math.round(Number(form.hourlyRateRupees) * 100),
      });
      setOfferings(await api.get<TutorSubject[]>('/tutor-subjects/me'));
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that subject.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteOffering(id: string) {
    await api.delete(`/tutor-subjects/${id}`);
    setOfferings(await api.get<TutorSubject[]>('/tutor-subjects/me'));
  }

  async function notifyWaitlist(tutorSubjectId: string) {
    setNotifyingId(tutorSubjectId);
    try {
      await api.post(`/marketplace/waitlists/tutor/${tutorSubjectId}/notify`);
      setNotifiedId(tutorSubjectId);
      setTimeout(() => setNotifiedId(null), 2000);
    } finally {
      setNotifyingId(null);
    }
  }

  const canSubmit = form.subjectId && form.curriculumId && Number(form.gradeMin) <= Number(form.gradeMax);

  return (
    <div>
      <PageHeader
        title="Subjects & rates"
        description="What you teach, which curricula, and your hourly rate for each — feeds the marketplace and 1:1 bookings."
        action={<Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : 'Add subject'}</Button>}
      />

      {showForm && (
        <Card className="mb-6">
          <div className="grid gap-4 sm:grid-cols-2">
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
                onChange={(e) => setForm({ ...form, curriculumId: e.target.value })}
              >
                <option value="">Select a curriculum</option>
                {curricula.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Grade from" hint={gradeLevels.length > 0 ? undefined : 'Pick a curriculum first'}>
              <select
                className={inputClass}
                value={form.gradeMin}
                onChange={(e) => setForm({ ...form, gradeMin: e.target.value })}
                disabled={gradeLevels.length === 0}
              >
                {gradeLevels.map((g) => (
                  <option key={g.id} value={g.ordinal}>
                    {g.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Grade to">
              <select
                className={inputClass}
                value={form.gradeMax}
                onChange={(e) => setForm({ ...form, gradeMax: e.target.value })}
                disabled={gradeLevels.length === 0}
              >
                {gradeLevels.map((g) => (
                  <option key={g.id} value={g.ordinal}>
                    {g.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Hourly rate (₹)">
              <input
                type="number"
                className={inputClass}
                value={form.hourlyRateRupees}
                onChange={(e) => setForm({ ...form, hourlyRateRupees: e.target.value })}
              />
            </Field>
          </div>

          {error && <p className="mt-3 text-sm text-error">{error}</p>}

          <div className="mt-4">
            <Button onClick={() => void createOffering()} disabled={!canSubmit || saving}>
              {saving ? 'Saving…' : 'Add subject'}
            </Button>
          </div>
        </Card>
      )}

      {offerings === null ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : offerings.length === 0 ? (
        <EmptyState
          title="No subjects added yet"
          description="Add what you teach so students can find and book you in the marketplace."
        />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0">
          {offerings.map((offering) => (
            <div key={offering.id} className="flex items-center justify-between px-6 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  {subjectName(offering.subject_id)} · {curriculumName(offering.curriculum_id)}
                </p>
                <p className="text-sm text-neutral-500">
                  Grades {offering.grade_min}–{offering.grade_max} ·{' '}
                  {formatMinor(offering.hourly_rate_minor, offering.currency)}/hr
                </p>
              </div>
              <div className="flex items-center gap-2">
                {notifiedId === offering.id ? (
                  <span className="text-sm text-success">Notified</span>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => void notifyWaitlist(offering.id)}
                    disabled={notifyingId === offering.id}
                  >
                    {notifyingId === offering.id ? 'Notifying…' : 'Notify waitlist'}
                  </Button>
                )}
                <Button variant="secondary" onClick={() => void deleteOffering(offering.id)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
