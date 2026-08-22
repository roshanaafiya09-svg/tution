'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Archive, CalendarClock, MoreVertical } from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import type {
  AcademyActiveTeacher,
  AcademyManagedBatch,
  Curriculum,
  GradeLevel,
  Subject,
} from '@/lib/types';
import {
  Button,
  CardSkeleton,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  Field,
  InlineError,
  Input,
  Select,
  StatusBadge,
  useToast,
} from '@/components/ui';
import { AcademyCard, AcademyPageIntro, AcademySetupBanner } from '@/components/academy';
import { useAcademyDashboard } from '@/components/academy-shell';

const EMPTY_FORM = {
  tutorId: '',
  title: '',
  subjectId: '',
  curriculumId: '',
  gradeLevelId: '',
  capacity: '15',
  feeRupees: '1500',
};

export default function AcademyBatchesPage() {
  const toast = useToast();
  const { hasAcademy } = useAcademyDashboard();
  const [batches, setBatches] = useState<AcademyManagedBatch[] | null>(null);
  const [teachers, setTeachers] = useState<AcademyActiveTeacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [loadError, setLoadError] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AcademyManagedBatch | null>(null);

  const load = useCallback(async () => {
    if (hasAcademy === false) {
      setBatches([]);
      return;
    }
    setLoadError(false);
    try {
      const [batchRows, teacherRows, subjectRows, curriculumRows] = await Promise.all([
        api.get<AcademyManagedBatch[]>('/academy/me/batches'),
        api.get<AcademyActiveTeacher[]>('/academy/me/teachers/active'),
        api.get<Subject[]>('/catalog/subjects'),
        api.get<Curriculum[]>('/catalog/curricula'),
      ]);
      setBatches(batchRows);
      setTeachers(teacherRows);
      setSubjects(subjectRows);
      setCurricula(curriculumRows);
    } catch {
      setLoadError(true);
    }
  }, [hasAcademy]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!form.curriculumId) {
      setGradeLevels([]);
      return;
    }
    void api.get<GradeLevel[]>(`/catalog/curricula/${form.curriculumId}/grade-levels`).then(setGradeLevels);
  }, [form.curriculumId]);

  async function createBatch() {
    setError(null);
    setSaving(true);
    try {
      await api.post('/academy/me/batches', {
        tutorId: form.tutorId,
        title: form.title,
        subjectId: form.subjectId,
        gradeLevelId: form.gradeLevelId,
        capacity: Number(form.capacity),
        feeMinor: Math.round(Number(form.feeRupees) * 100),
      });
      await load();
      setShowForm(false);
      setForm(EMPTY_FORM);
      toast({ title: 'Batch created', variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the batch.');
    } finally {
      setSaving(false);
    }
  }

  async function archiveBatch(batch: AcademyManagedBatch) {
    await api.post(`/academy/me/batches/${batch.id}/archive`);
    await load();
    toast({ title: `${batch.title} archived`, variant: 'success' });
  }

  function subjectName(subjectId: string): string {
    return subjects.find((s) => s.id === subjectId)?.name_i18n.en ?? 'Subject';
  }

  const canSubmit = form.tutorId && form.title && form.subjectId && form.gradeLevelId;

  return (
    <div>
      <AcademySetupBanner />
      <AcademyPageIntro
        eyebrow="Academy Dashboard"
        title="Batches"
        description="Create and manage batches on behalf of your active teachers."
        action={
          teachers.length > 0 ? (
            <Button size="sm" onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Cancel' : 'New batch'}
            </Button>
          ) : undefined
        }
      />

      {showForm && (
        <AcademyCard className="mb-6 mt-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Teacher" required>
              <Select value={form.tutorId} onChange={(e) => setForm({ ...form, tutorId: e.target.value })}>
                <option value="">Select a teacher</option>
                {teachers.map((t) => (
                  <option key={t.tutorId} value={t.tutorId}>
                    {t.displayName ?? 'Teacher'}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Batch name">
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Grade 10 Physics — Evening"
              />
            </Field>
            <Field label="Subject">
              <Select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
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
                onChange={(e) => setForm({ ...form, curriculumId: e.target.value, gradeLevelId: '' })}
              >
                <option value="">Select a curriculum</option>
                {curricula.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Grade">
              <Select
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
              </Select>
            </Field>
            <Field label="Capacity">
              <Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
            </Field>
            <Field label="Monthly fee (₹)">
              <Input type="number" value={form.feeRupees} onChange={(e) => setForm({ ...form, feeRupees: e.target.value })} />
            </Field>
          </div>

          {error && (
            <div className="mt-3">
              <InlineError>{error}</InlineError>
            </div>
          )}

          <div className="mt-4">
            <Button onClick={() => void createBatch()} disabled={!canSubmit || saving} loading={saving}>
              {saving ? 'Creating…' : 'Create batch'}
            </Button>
          </div>
        </AcademyCard>
      )}

      <div className={showForm ? '' : 'mt-8'}>
        {loadError ? (
          <ErrorState description="Could not load your batches. Check your connection and try again." onRetry={() => void load()} />
        ) : batches === null ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : teachers.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="Add a teacher first"
            description="Batches are created on behalf of one of your active teachers — accept a teacher's join request from Teachers before creating a batch."
          />
        ) : batches.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No batches yet"
            description="Create your first batch on behalf of one of your teachers."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {batches.map((batch) => (
              <AcademyCard key={batch.id} interactive className="flex h-full flex-col">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/academy/batches/${batch.id}`} className="min-w-0 flex-1">
                    <p className="truncate font-medium text-neutral-900 dark:text-neutral-50">{batch.title}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {subjectName(batch.subjectId)} · {batch.tutorDisplayName ?? 'Teacher'}
                    </p>
                  </Link>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <StatusBadge status={batch.status} />
                    {batch.status === 'active' && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label="More actions"
                            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                          >
                            <MoreVertical className="h-4 w-4" aria-hidden />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onSelect={() => setArchiveTarget(batch)}>
                            <Archive className="h-4 w-4" aria-hidden />
                            Archive batch
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                <Link href={`/academy/batches/${batch.id}`} className="mt-3 flex-1 space-y-1">
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {batch.enrolledCount}/{batch.capacity} students · {formatMinor(batch.feeMinor, batch.currency)}/
                    {batch.feePeriod === 'monthly' ? 'month' : batch.feePeriod}
                  </p>
                </Link>
              </AcademyCard>
            ))}
          </div>
        )}
      </div>

      {archiveTarget && (
        <ConfirmDialog
          open={!!archiveTarget}
          onOpenChange={(open) => !open && setArchiveTarget(null)}
          onConfirm={() => archiveBatch(archiveTarget)}
          title="Archive this batch?"
          description={`${archiveTarget.title} will move to Archived. Students keep their history, but the batch stops accepting new sessions.`}
          confirmLabel="Archive"
        />
      )}
    </div>
  );
}
