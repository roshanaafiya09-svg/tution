'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Laptop, Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { AssessmentRow, Batch, Subject } from '@/lib/types';
import { Button, CardSkeleton, ErrorState, Field, Input, InlineError, Select, StatusBadge } from '@/components/ui';
import { AcademicCard, BatchMultiSelect, EmptyPanel } from '@/components/dashboard';

export default function OnlineAssessmentsPage() {
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

  const load = useCallback(async () => {
    setLoadError(null);
    setBatchesFailed(false);
    try {
      const [assessments, batchRows, subjectRows] = await Promise.all([
        api.get<AssessmentRow[]>('/assessments/online/me'),
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
    if (!title.trim() || !subjectId || batchIds.length === 0) {
      setError('Title, subject, and at least one batch are required.');
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const assessment = await api.post<AssessmentRow>('/assessments/online', {
        title: title.trim(),
        subjectId,
        batchIds,
      });
      router.push(`/dashboard/assessments/online/${assessment.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create this assessment.');
    } finally {
      setCreating(false);
    }
  }

  if (loadError) {
    return <ErrorState error={loadError} what="your online assessments" onRetry={() => void load()} />;
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
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">Online assessments</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Upload material, review Gemini-drafted questions, then publish to your selected batches.
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
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fractions Test" />
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
          </div>
        </AcademicCard>
      )}

      {rows.length === 0 && !showForm ? (
        <EmptyPanel
          icon={Laptop}
          title="No online assessments yet"
          description="Create one, select one or more batches, upload a PDF, and Gemini drafts multiple-choice questions for you to review and edit before publishing."
          steps={[
            'Select one or more authorized batches',
            'Upload learning material (PDF)',
            'Review and edit AI-drafted questions',
            'Publish — students in every selected batch are notified',
          ]}
          action={
            <Button size="sm" onClick={() => setShowForm(true)}>
              Create your first online assessment
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
                    href={`/dashboard/assessments/online/${row.id}`}
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-neutral-50 sm:px-5 dark:hover:bg-neutral-800/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                        {row.title}
                      </p>
                      <p className="text-xs text-neutral-400 dark:text-neutral-500">
                        {row.max_score ? `${row.max_score} marks · ` : ''}
                        {new Date(row.created_at).toLocaleDateString('en-IN')}
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
