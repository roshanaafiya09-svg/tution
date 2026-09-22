'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, NotebookPen, Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { AssessmentRow, Batch, Subject } from '@/lib/types';
import { Button, CardSkeleton, ErrorState, Field, Input, InlineError, Select, StatusBadge } from '@/components/ui';
import { AcademicCard, BatchMultiSelect, EmptyPanel } from '@/components/dashboard';

export default function OfflineAssessmentsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<AssessmentRow[] | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [batchesFailed, setBatchesFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [assessmentDate, setAssessmentDate] = useState('');
  const [maxScore, setMaxScore] = useState(100);

  const load = useCallback(async () => {
    setLoadError(null);
    setBatchesFailed(false);
    try {
      const [assessments, batchRows, subjectRows] = await Promise.all([
        api.get<AssessmentRow[]>('/assessments/offline/me'),
        // Only the create form needs batches — a failure here must not
        // hide the assessment list the page is actually about.
        api.get<Batch[]>('/batches/me').catch(() => {
          setBatchesFailed(true);
          return [] as Batch[];
        }),
        api.get<Subject[]>('/catalog/subjects'),
      ]);
      setRows(assessments);
      setBatches(batchRows.filter((b) => b.status === 'active'));
      setSubjects(subjectRows);
    } catch (err) {
      setLoadError(err ?? true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (!title.trim() || !subjectId || batchIds.length === 0 || !assessmentDate || maxScore <= 0) {
      setError('Title, subject, batches, date, and a valid maximum score are all required.');
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const assessment = await api.post<AssessmentRow>('/assessments/offline', {
        title: title.trim(),
        subjectId,
        batchIds,
        assessmentDate,
        maxScore,
      });
      router.push(`/dashboard/assessments/offline/${assessment.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create this assessment.');
    } finally {
      setCreating(false);
    }
  }

  if (loadError) {
    return <ErrorState error={loadError} what="your offline assessments" onRetry={() => void load()} />;
  }

  if (rows === null) {
    return (
      <div className="space-y-4">
        <CardSkeleton className="h-24 rounded-2xl" />
        <CardSkeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">Offline assessments</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            A physical test conducted in class — question paper is required before it can be scheduled.
          </p>
        </div>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New
          </Button>
        )}
      </div>

      {showForm && (
        <AcademicCard>
          <div className="space-y-4">
            <Field label="Assessment title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Algebra Test" />
            </Field>
            <Field label="Subject">
              <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                <option value="">Choose a subject</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name_i18n.en}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Select batches">
              <BatchMultiSelect batches={batches} selected={batchIds} onChange={setBatchIds} disabled={creating} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Assessment date">
                <Input type="date" value={assessmentDate} onChange={(e) => setAssessmentDate(e.target.value)} />
              </Field>
              <Field label="Maximum score">
                <Input
                  type="number"
                  min={1}
                  value={maxScore}
                  onChange={(e) => setMaxScore(Math.max(1, Number(e.target.value) || 1))}
                />
              </Field>
            </div>
            {batchesFailed && <InlineError>Could not load your batches — reload the page to pick batches for this assessment.</InlineError>}
            {error && <InlineError>{error}</InlineError>}
            <div className="flex gap-2">
              <Button onClick={() => void create()} disabled={creating} loading={creating}>
                {creating ? 'Creating…' : 'Create draft'}
              </Button>
              <Button variant="secondary" onClick={() => setShowForm(false)} disabled={creating}>
                Cancel
              </Button>
            </div>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              You&apos;ll upload the required question paper and schedule the assessment on the next screen.
            </p>
          </div>
        </AcademicCard>
      )}

      {rows.length === 0 && !showForm ? (
        <EmptyPanel
          icon={NotebookPen}
          title="No offline assessments yet"
          description="Create one, select one or more batches, and upload the mandatory question paper before you can schedule it."
          steps={[
            'Select one or more authorized batches',
            'Upload the question paper — required, not optional',
            'Schedule the assessment',
            'Download the roster template, conduct the test, then upload scores',
          ]}
          action={
            <Button size="sm" onClick={() => setShowForm(true)}>
              Create your first offline assessment
            </Button>
          }
        />
      ) : (
        rows.length > 0 && (
          <AcademicCard className="p-0">
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {rows.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/dashboard/assessments/offline/${row.id}`}
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-neutral-50 sm:px-5 dark:hover:bg-neutral-800/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                        {row.title}
                      </p>
                      <p className="text-xs text-neutral-400 dark:text-neutral-500">
                        {row.assessment_date ? new Date(row.assessment_date).toLocaleDateString('en-IN') : '—'}
                        {row.question_paper_object_key ? '' : ' · question paper missing'}
                      </p>
                    </div>
                    <StatusBadge status={row.status} />
                    <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300 dark:text-neutral-600" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </AcademicCard>
        )
      )}
    </div>
  );
}
