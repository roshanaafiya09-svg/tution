'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookMarked, Bell, X, Check } from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import type { Curriculum, GradeLevel, Subject, TutorSubject } from '@/lib/types';
import {
  EmptyState,
  Button,
  Field,
  Input,
  Select,
  InlineError,
  CardSkeleton,
  ErrorState,
  ConfirmDialog,
  useToast,
} from '@/components/ui';
import { TeacherPageHeader, AcademicCard } from '@/components/dashboard';

export default function SubjectsPage() {
  const toast = useToast();
  const [offerings, setOfferings] = useState<TutorSubject[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [loadError, setLoadError] = useState(false);
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

  const load = useCallback(() => {
    setLoadError(false);
    Promise.all([
      api.get<TutorSubject[]>('/tutor-subjects/me'),
      api.get<Subject[]>('/catalog/subjects'),
      api.get<Curriculum[]>('/catalog/curricula'),
    ])
      .then(([o, subs, curr]) => {
        setOfferings(o);
        setSubjects(subs);
        setCurricula(curr);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
      toast({ title: 'Subject added', variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that subject.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteOffering(id: string) {
    await api.delete(`/tutor-subjects/${id}`);
    setOfferings(await api.get<TutorSubject[]>('/tutor-subjects/me'));
    toast({ title: 'Subject removed', variant: 'success' });
  }

  async function notifyWaitlist(tutorSubjectId: string) {
    setNotifyingId(tutorSubjectId);
    try {
      await api.post(`/marketplace/waitlists/tutor/${tutorSubjectId}/notify`);
      setNotifiedId(tutorSubjectId);
      setTimeout(() => setNotifiedId(null), 2000);
    } catch {
      toast({ title: 'Could not notify the waitlist', variant: 'error' });
    } finally {
      setNotifyingId(null);
    }
  }

  const canSubmit = form.subjectId && form.curriculumId && Number(form.gradeMin) <= Number(form.gradeMax);

  return (
    <div>
      <TeacherPageHeader
        eyebrow="Teaching profile"
        title="Subjects & rates"
        description="What you teach, which curricula, and your hourly rate for each — feeds the marketplace and 1:1 bookings."
        action={<Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : 'Add subject'}</Button>}
      />

      <p className="mb-6 mt-4 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
        Students search and filter by subject, curriculum, and rate — the more complete this list, the easier you
        are to find and book.
      </p>

      {showForm && (
        <AcademicCard className="mb-6">
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
        </AcademicCard>
      )}

      {loadError ? (
        <ErrorState description="Could not load your subjects. Check your connection and try again." onRetry={load} />
      ) : offerings === null ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : offerings.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="No subjects added yet"
          description="Add what you teach so students can discover and book you."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {offerings.map((offering) => (
            <AcademicCard key={offering.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-neutral-900 dark:text-neutral-50">
                    {subjectName(offering.subject_id)}
                  </p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {curriculumName(offering.curriculum_id)} · Grades {offering.grade_min}–{offering.grade_max}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setOfferingToDelete(offering)}
                  aria-label="Remove subject"
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              </div>
              <p className="mt-3 font-display text-xl font-semibold text-neutral-900 dark:text-neutral-50">
                {formatMinor(offering.hourly_rate_minor, offering.currency)}/hr
              </p>
              <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                Listed for marketplace search & 1:1 bookings
              </p>
              <div className="mt-4">
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
              </div>
            </AcademicCard>
          ))}
        </div>
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
