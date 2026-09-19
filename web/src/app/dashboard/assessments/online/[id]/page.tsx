'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Check, Upload, Users2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { describeLoadError, type LoadErrorInfo } from '@/lib/load-error';
import type {
  AssessmentQuestion,
  AssessmentResult,
  Batch,
  Material,
  OnlineAssessmentDetail,
  QuizDifficulty,
} from '@/lib/types';
import {
  StatusBadge,
  Button,
  Field,
  Input,
  Select,
  InlineError,
  CardSkeleton,
  ErrorState,
  useToast,
} from '@/components/ui';
import { TeacherPageHeader, AcademicCard } from '@/components/dashboard';

const ALLOWED_MATERIAL_MIMES = ['application/pdf'];

export default function OnlineAssessmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [assessment, setAssessment] = useState<OnlineAssessmentDetail | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loadError, setLoadError] = useState<LoadErrorInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [results, setResults] = useState<AssessmentResult[] | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [a, batchRows] = await Promise.all([
        api.get<OnlineAssessmentDetail>(`/assessments/online/${id}`),
        // Batch names are only header decoration here — never fatal.
        api.get<Batch[]>('/batches/me').catch(() => [] as Batch[]),
      ]);
      setAssessment(a);
      setBatches(batchRows);
      if (a.status === 'published' || a.status === 'completed') {
        api
          .get<AssessmentResult[]>(`/assessments/online/${id}/results`)
          .then(setResults)
          .catch(() => setResults([]));
      }
    } catch (err) {
      setLoadError(describeLoadError(err, 'this assessment'));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadAndGenerate(file: File) {
    if (!assessment) return;
    if (!ALLOWED_MATERIAL_MIMES.includes(file.type)) {
      setError('Assessment question generation only supports PDF materials right now.');
      return;
    }
    const targetBatchId = assessment.batchIds[0];
    if (!targetBatchId) {
      setError('This assessment has no selected batches.');
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const { material, upload } = await api.post<{
        material: Material;
        upload: { uploadUrl: string; headers?: Record<string, string> };
      }>('/materials/upload-url', {
        batchId: targetBatchId,
        title: file.name,
        mime: file.type,
        sizeBytes: file.size,
      });
      const res = await fetch(upload.uploadUrl, { method: 'PUT', headers: upload.headers, body: file });
      if (!res.ok) throw new Error('Upload failed');
      await api.post(`/assessments/online/${id}/generate`, { materialId: material.id, count: 10 });
      await load();
      toast({ title: 'Questions generated — review them below', variant: 'success' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate questions from that material.');
    } finally {
      setGenerating(false);
    }
  }

  async function publish() {
    setPublishing(true);
    setError(null);
    try {
      await api.post(`/assessments/online/${id}/publish`);
      await load();
      toast({ title: 'Assessment published to selected batches', variant: 'success' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not publish this assessment.');
    } finally {
      setPublishing(false);
    }
  }

  if (loadError) {
    return <ErrorState title={loadError.title} description={loadError.description} onRetry={() => void load()} />;
  }

  if (!assessment) {
    return (
      <div className="space-y-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const selectedBatches = batches.filter((b) => assessment.batchIds.includes(b.id));
  const canGenerate = assessment.status === 'draft';
  const canPublish = assessment.status === 'draft' && assessment.questions.length > 0;

  return (
    <div>
      <TeacherPageHeader
        eyebrow={selectedBatches.map((b) => b.title).join(', ') || 'Online assessment'}
        title={assessment.title}
        description={`${assessment.questions.length} question${assessment.questions.length === 1 ? '' : 's'} · ${assessment.max_score ?? 0} marks · ${selectedBatches.length} batch${selectedBatches.length === 1 ? '' : 'es'} selected`}
        action={<StatusBadge status={assessment.status} />}
      />

      {error && (
        <div className="mb-4 mt-8">
          <InlineError>{error}</InlineError>
        </div>
      )}

      {canGenerate && assessment.questions.length === 0 && (
        <AcademicCard className="mt-8">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-neutral-200 px-6 py-10 text-center transition-colors hover:border-brand-300 dark:border-neutral-700 dark:hover:border-brand-600">
            <Upload className="h-6 w-6 text-neutral-400" aria-hidden />
            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
              {generating ? 'Generating questions…' : 'Upload learning material (PDF)'}
            </span>
            <span className="text-xs text-neutral-400 dark:text-neutral-500">
              Gemini drafts multiple-choice questions from it — you review and edit before publishing.
            </span>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={generating}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadAndGenerate(file);
                e.target.value = '';
              }}
            />
          </label>
        </AcademicCard>
      )}

      {assessment.questions.length > 0 && (
        <div className="mt-8 space-y-4">
          {assessment.questions.map((question) => (
            <QuestionCard
              key={question.id}
              assessmentId={assessment.id}
              question={question}
              editable={assessment.status === 'draft'}
              onSaved={load}
            />
          ))}
        </div>
      )}

      {canPublish && (
        <div className="mt-6">
          <Button onClick={() => void publish()} disabled={publishing} loading={publishing}>
            {publishing ? 'Publishing…' : 'Publish to selected batches'}
          </Button>
        </div>
      )}

      {(assessment.status === 'published' || assessment.status === 'completed') && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            {assessment.status === 'completed' ? 'Completed — every required student has submitted' : 'Published — students have been notified'}
          </h2>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300">
            <Users2 className="h-4 w-4" aria-hidden />
            Results
          </h3>
          {results === null ? (
            <CardSkeleton />
          ) : results.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">No submissions yet.</p>
          ) : (
            <AcademicCard className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
              {results.map((result) => (
                <div key={result.id} className="flex items-center justify-between px-6 py-3">
                  <p className="text-sm text-neutral-900 dark:text-neutral-100">
                    {result.display_name ?? result.student_id.slice(0, 8)}
                  </p>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    {result.score}/{result.max_score}
                  </p>
                </div>
              ))}
            </AcademicCard>
          )}
        </div>
      )}
    </div>
  );
}

function QuestionCard({
  assessmentId,
  question,
  editable,
  onSaved,
}: {
  assessmentId: string;
  question: AssessmentQuestion;
  editable: boolean;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    questionText: question.question_text,
    choices: [...question.choices],
    correctChoiceIndex: question.correct_choice_index,
    marks: question.marks,
    difficulty: question.difficulty,
    explanation: question.explanation ?? '',
  });

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/assessments/online/${assessmentId}/questions/${question.id}`, form);
      setEditing(false);
      onSaved();
      toast({ title: 'Question updated', variant: 'success' });
    } catch {
      toast({ title: 'Could not save this question', variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <AcademicCard>
        <div className="flex items-start justify-between gap-3">
          <p className="font-medium text-neutral-900 dark:text-neutral-50">{question.question_text}</p>
          <span className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">
            {question.marks} mark{question.marks === 1 ? '' : 's'} · {question.difficulty}
          </span>
        </div>
        <ul className="mt-3 space-y-1">
          {question.choices.map((choice, i) => (
            <li
              key={i}
              className={`flex items-center gap-1.5 text-sm ${
                i === question.correct_choice_index
                  ? 'font-medium text-success dark:text-success-dark'
                  : 'text-neutral-600 dark:text-neutral-400'
              }`}
            >
              {i === question.correct_choice_index && <Check className="h-3.5 w-3.5" aria-hidden />}
              {choice}
            </li>
          ))}
        </ul>
        {question.explanation && (
          <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">{question.explanation}</p>
        )}
        {editable && (
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </AcademicCard>
    );
  }

  return (
    <AcademicCard>
      <Field label="Question">
        <Input
          value={form.questionText}
          onChange={(e) => setForm({ ...form, questionText: e.target.value })}
        />
      </Field>
      <div className="mt-3 space-y-2">
        {form.choices.map((choice, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name={`correct-${question.id}`}
              checked={form.correctChoiceIndex === i}
              onChange={() => setForm({ ...form, correctChoiceIndex: i })}
              className="h-4 w-4 accent-brand-600 dark:accent-brand-400"
            />
            <Input
              className="flex-1"
              value={choice}
              onChange={(e) => {
                const choices = [...form.choices];
                choices[i] = e.target.value;
                setForm({ ...form, choices });
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Marks">
          <Input
            type="number"
            min={1}
            value={form.marks}
            onChange={(e) => setForm({ ...form, marks: Math.max(1, Number(e.target.value) || 1) })}
          />
        </Field>
        <Field label="Difficulty">
          <Select
            value={form.difficulty}
            onChange={(e) => setForm({ ...form, difficulty: e.target.value as QuizDifficulty })}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Explanation (optional)">
          <Input
            value={form.explanation}
            onChange={(e) => setForm({ ...form, explanation: e.target.value })}
          />
        </Field>
      </div>
      <div className="mt-4 flex gap-2">
        <Button onClick={() => void save()} disabled={saving} loading={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </Button>
      </div>
    </AcademicCard>
  );
}
