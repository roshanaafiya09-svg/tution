'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Users, Search, MoreVertical, UserPlus, CalendarClock, ClipboardCheck, Archive } from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import type { Batch, Curriculum, GradeLevel, Subject, Session, FeeEntry, Enrollment } from '@/lib/types';
import {
  EmptyState,
  StatusBadge,
  Button,
  Field,
  Input,
  Select,
  InlineError,
  CardSkeleton,
  ErrorState,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  useToast,
} from '@/components/ui';
import { TeacherPageHeader, AcademicCard } from '@/components/dashboard';

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatNextClass(session: Session): string {
  return new Date(session.scheduled_start_utc).toLocaleString('en-IN', {
    timeZone: session.timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function BatchesPage() {
  const toast = useToast();
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [feeEntries, setFeeEntries] = useState<FeeEntry[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [loadError, setLoadError] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Batch | null>(null);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('all');

  const [form, setForm] = useState({
    title: '',
    subjectId: '',
    curriculumId: '',
    gradeLevelId: '',
    capacity: '15',
    feeRupees: '1500',
  });

  const load = useCallback(() => {
    setLoadError(false);
    setBatches(null);
    Promise.all([
      api.get<Batch[]>('/batches/me'),
      api.get<Subject[]>('/catalog/subjects'),
      api.get<Curriculum[]>('/catalog/curricula'),
      api.get<Session[]>('/sessions/me'),
      api.get<FeeEntry[]>(`/fees/period?period=${currentPeriod()}`),
    ])
      .then(([b, subs, curr, sess, fees]) => {
        setBatches(b);
        setSubjects(subs);
        setCurricula(curr);
        setSessions(sess);
        setFeeEntries(fees);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!batches || batches.length === 0) return;
    let cancelled = false;
    Promise.all(
      batches.map((b) =>
        api
          .get<Enrollment[]>(`/batches/${b.id}/students`)
          .then((rows) => [b.id, rows.filter((r) => r.status === 'active').length] as const)
          .catch(() => [b.id, 0] as const),
      ),
    ).then((pairs) => {
      if (!cancelled) setStudentCounts(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [batches]);

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
      load();
      setShowForm(false);
      setForm({ ...form, title: '' });
      toast({ title: 'Batch created', variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the batch.');
    } finally {
      setSaving(false);
    }
  }

  async function archiveBatch(batch: Batch) {
    await api.post(`/batches/${batch.id}/archive`);
    load();
    toast({ title: `${batch.title} archived`, variant: 'success' });
  }

  const canSubmit = form.title && form.subjectId && form.gradeLevelId;

  function subjectName(subjectId: string): string {
    return subjects.find((s) => s.id === subjectId)?.name_i18n.en ?? 'Subject';
  }

  const nextSessionByBatch = useMemo(() => {
    const now = new Date();
    const map = new Map<string, Session>();
    for (const s of sessions) {
      if (s.status !== 'scheduled') continue;
      if (new Date(s.scheduled_start_utc) < now) continue;
      const existing = map.get(s.batch_id);
      if (!existing || new Date(s.scheduled_start_utc) < new Date(existing.scheduled_start_utc)) {
        map.set(s.batch_id, s);
      }
    }
    return map;
  }, [sessions]);

  const feeStatusByBatch = useMemo(() => {
    const map = new Map<string, { paid: number; total: number }>();
    for (const e of feeEntries) {
      const cur = map.get(e.batch_id) ?? { paid: 0, total: 0 };
      cur.total += 1;
      if (e.status === 'paid' || e.status === 'waived') cur.paid += 1;
      map.set(e.batch_id, cur);
    }
    return map;
  }, [feeEntries]);

  const filteredBatches = (batches ?? []).filter((batch) => {
    if (statusFilter !== 'all' && batch.status !== statusFilter) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return batch.title.toLowerCase().includes(q) || subjectName(batch.subject_id).toLowerCase().includes(q);
  });

  return (
    <div>
      <TeacherPageHeader
        eyebrow="Your teaching spaces"
        title="Batches"
        description="Each batch is a group you teach on a schedule."
        action={<Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : 'New batch'}</Button>}
      />

      {showForm && (
        <AcademicCard className="mb-6 mt-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Batch name">
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Grade 10 Physics — Evening"
              />
            </Field>
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
              <Input
                type="number"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              />
            </Field>
            <Field label="Monthly fee (₹)" hint="Stored in paise — no rounding errors.">
              <Input
                type="number"
                value={form.feeRupees}
                onChange={(e) => setForm({ ...form, feeRupees: e.target.value })}
              />
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
        </AcademicCard>
      )}

      <div className={showForm ? '' : 'mt-8'}>
      {batches === null ? (
        loadError ? (
          <ErrorState description="Could not load your batches. Check your connection and try again." onRetry={load} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        )
      ) : batches.length === 0 ? (
        <div className="space-y-6">
          <EmptyState
            icon={Users}
            title="No batches yet"
            description="Create your first batch to organise students, schedules, materials, attendance, and fees in one place."
            action={
              <Button size="sm" onClick={() => setShowForm(true)}>
                + Create your first batch
              </Button>
            }
          />
          <AcademicCard>
            <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">What happens next?</p>
            <ol className="mt-3 space-y-2 text-sm text-neutral-500 dark:text-neutral-400">
              <li>1. Create a batch</li>
              <li>2. Add students — share the invite link that appears on the batch page</li>
              <li>3. Set the schedule from the batch&apos;s Sessions tab</li>
              <li>4. Share the invite link on WhatsApp to bring your students in</li>
            </ol>
          </AcademicCard>
        </div>
      ) : (
        <>
          {batches.length > 1 && (
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 sm:max-w-xs">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search batches"
                  className="pl-9"
                />
              </div>
              <div className="flex gap-1.5">
                {(['all', 'active', 'archived'] as const).map((option) => (
                  <Button
                    key={option}
                    variant={statusFilter === option ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setStatusFilter(option)}
                    className="capitalize"
                  >
                    {option}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {filteredBatches.length === 0 ? (
            <p className="py-10 text-center text-sm text-neutral-400 dark:text-neutral-500">
              No batches match your search.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {filteredBatches.map((batch) => {
                const nextSession = nextSessionByBatch.get(batch.id);
                const feeStatus = feeStatusByBatch.get(batch.id);
                const enrolled = studentCounts[batch.id];

                return (
                  <AcademicCard key={batch.id} interactive className="flex h-full flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/dashboard/batches/${batch.id}`} className="min-w-0 flex-1">
                        <p className="truncate font-medium text-neutral-900 dark:text-neutral-50">
                          {batch.title}
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {subjectName(batch.subject_id)}
                        </p>
                      </Link>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <StatusBadge status={batch.status} />
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
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/batches/${batch.id}?tab=students`}>
                                <UserPlus className="h-4 w-4" aria-hidden />
                                Add student
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/batches/${batch.id}?tab=sessions`}>
                                <CalendarClock className="h-4 w-4" aria-hidden />
                                Schedule class
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/batches/${batch.id}?tab=sessions`}>
                                <ClipboardCheck className="h-4 w-4" aria-hidden />
                                Mark attendance
                              </Link>
                            </DropdownMenuItem>
                            {batch.status === 'active' && (
                              <DropdownMenuItem onSelect={() => setArchiveTarget(batch)}>
                                <Archive className="h-4 w-4" aria-hidden />
                                Archive batch
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    <Link href={`/dashboard/batches/${batch.id}`} className="mt-3 flex-1 space-y-1">
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        {enrolled !== undefined ? `${enrolled}/${batch.capacity}` : `Up to ${batch.capacity}`} students
                        {' · '}
                        {formatMinor(batch.fee_minor, batch.currency)}/
                        {batch.fee_period === 'monthly' ? 'month' : batch.fee_period}
                      </p>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        {nextSession ? `Next class ${formatNextClass(nextSession)}` : 'No upcoming class scheduled'}
                      </p>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        {feeStatus ? `${feeStatus.paid}/${feeStatus.total} paid this period` : 'Fees not generated this period'}
                      </p>
                    </Link>
                  </AcademicCard>
                );
              })}
            </div>
          )}
        </>
      )}
      </div>

      {archiveTarget && (
        <ConfirmDialog
          open={!!archiveTarget}
          onOpenChange={(open) => !open && setArchiveTarget(null)}
          onConfirm={() => archiveBatch(archiveTarget)}
          title="Archive this batch?"
          description={`${archiveTarget.title} will move to Archived. Students keep their history, but the batch stops accepting new sessions or fee records.`}
          confirmLabel="Archive"
        />
      )}
    </div>
  );
}
