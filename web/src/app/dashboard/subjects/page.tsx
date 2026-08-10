'use client';

import { useEffect, useState } from 'react';
import { BookMarked, Bell, X, Check } from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import type { Curriculum, GradeLevel, Subject, TutorSubject } from '@/lib/types';
import {
  Card,
  PageHeader,
  EmptyState,
  Button,
  Field,
  Input,
  Select,
  InlineError,
  PageLoading,
  ConfirmDialog,
} from '@/components/ui';

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
  const [offeringToDelete, setOfferingToDelete] = useState<TutorSubject | null>(null);

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
              <Select
                value={form.subjectId}
                onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
              >
                <option value="">Select a subject</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name_i18n.en}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Curriculum">
              <Select
                value={form.curriculumId}
                onChange={(e) => setForm({ ...form, curriculumId: e.target.value })}
              >
                <option value="">Select a curriculum</option>
                {curricula.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Grade from" hint={gradeLevels.length > 0 ? undefined : 'Pick a curriculum first'}>
              <Select
                value={form.gradeMin}
                onChange={(e) => setForm({ ...form, gradeMin: e.target.value })}
                disabled={gradeLevels.length === 0}
              >
                {gradeLevels.map((g) => (
                  <option key={g.id} value={g.ordinal}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Grade to">
              <Select
                value={form.gradeMax}
                onChange={(e) => setForm({ ...form, gradeMax: e.target.value })}
                disabled={gradeLevels.length === 0}
              >
                {gradeLevels.map((g) => (
                  <option key={g.id} value={g.ordinal}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Hourly rate (₹)">
              <Input
                type="number"
                value={form.hourlyRateRupees}
                onChange={(e) => setForm({ ...form, hourlyRateRupees: e.target.value })}
              />
            </Field>
          </div>

          {error && (
            <div className="mt-3">
              <InlineError>{error}</InlineError>
            </div>
          )}

          <div className="mt-4">
            <Button onClick={() => void createOffering()} disabled={!canSubmit || saving} loading={saving}>
              {saving ? 'Saving…' : 'Add subject'}
            </Button>
          </div>
        </Card>
      )}

      {offerings === null ? (
        <PageLoading />
      ) : offerings.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="No subjects added yet"
          description="Add what you teach so students can find and book you in the marketplace."
        />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
          {offerings.map((offering) => (
            <div key={offering.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                  {subjectName(offering.subject_id)} · {curriculumName(offering.curriculum_id)}
                </p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Grades {offering.grade_min}–{offering.grade_max} ·{' '}
                  {formatMinor(offering.hourly_rate_minor, offering.currency)}/hr
                </p>
              </div>
              <div className="flex items-center gap-2">
                {notifiedId === offering.id ? (
                  <span className="flex items-center gap-1 text-sm text-success dark:text-success-dark">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    Notified
                  </span>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void notifyWaitlist(offering.id)}
                    disabled={notifyingId === offering.id}
                    loading={notifyingId === offering.id}
                  >
                    <Bell className="h-3.5 w-3.5" aria-hidden />
                    {notifyingId === offering.id ? 'Notifying…' : 'Notify waitlist'}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setOfferingToDelete(offering)}
                  aria-label="Remove subject"
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <ConfirmDialog
        open={offeringToDelete !== null}
        onOpenChange={(open) => !open && setOfferingToDelete(null)}
        onConfirm={() => (offeringToDelete ? deleteOffering(offeringToDelete.id) : Promise.resolve())}
        title="Remove this subject offering?"
        description={
          offeringToDelete
            ? `You'll stop appearing in marketplace search for ${subjectName(offeringToDelete.subject_id)} (${curriculumName(offeringToDelete.curriculum_id)}). Existing bookings aren't affected.`
            : ''
        }
        confirmLabel="Remove"
      />
    </div>
  );
}
