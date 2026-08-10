'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Check, Users2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type {
  Batch,
  PublishedQuiz,
  QuizAttemptSummary,
  QuizDifficulty,
  QuizDraftDetail,
  QuizDraftQuestion,
} from '@/lib/types';
import {
  Card,
  PageHeader,
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

export default function QuizDraftPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [draft, setDraft] = useState<QuizDraftDetail | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [publishedQuiz, setPublishedQuiz] = useState<PublishedQuiz | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [attempts, setAttempts] = useState<QuizAttemptSummary[] | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const d = await api.get<QuizDraftDetail>(`/quizzes/${id}`);
      setDraft(d);
      api
        .get<Batch>(`/batches/${d.batch_id}`)
        .then(setBatch)
        .catch(() => {});
    } catch {
      setLoadError(true);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(action: 'approve' | 'reject') {
    setReviewing(true);
    setError(null);
    try {
      await api.post(`/quizzes/${id}/${action}`);
      await load();
      toast({ title: action === 'approve' ? 'Quiz approved' : 'Quiz rejected', variant: 'success' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your review.');
    } finally {
      setReviewing(false);
    }
  }

  async function publish() {
    setPublishing(true);
    setError(null);
    try {
      const quiz = await api.post<PublishedQuiz>(`/quizzes/${id}/publish`);
      setPublishedQuiz(quiz);
      setAttempts(await api.get<QuizAttemptSummary[]>(`/quizzes/${quiz.id}/attempts`));
      toast({ title: 'Quiz published to batch', variant: 'success' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not publish this quiz.');
    } finally {
      setPublishing(false);
    }
  }

  if (loadError) {
    return <ErrorState description="Could not load this quiz draft. Check your connection and try again." onRetry={() => void load()} />;
  }

  if (!draft) {
    return (
      <div className="space-y-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow={batch ? batch.title : undefined}
        title="Quiz draft"
        description={`${draft.questions.length} question${draft.questions.length === 1 ? '' : 's'} · review each one before approving — nothing reaches students until you publish.`}
        action={<StatusBadge status={draft.status} />}
      />

      {error && (
        <div className="mb-4">
          <InlineError>{error}</InlineError>
        </div>
      )}

      <div className="space-y-4">
        {draft.questions.map((question) => (
          <QuestionCard
            key={question.id}
            draftId={draft.id}
            question={question}
            editable={draft.status === 'pending_review'}
            onSaved={load}
          />
        ))}
      </div>

      {draft.status === 'pending_review' && (
        <div className="mt-6 flex gap-3">
          <Button onClick={() => void review('approve')} disabled={reviewing} loading={reviewing}>
            {reviewing ? 'Saving…' : 'Approve'}
          </Button>
          <Button variant="danger" onClick={() => void review('reject')} disabled={reviewing}>
            Reject
          </Button>
        </div>
      )}

      {draft.status === 'approved' && (
        <div className="mt-6">
          <Button onClick={() => void publish()} disabled={publishing} loading={publishing}>
            {publishing ? 'Publishing…' : 'Publish to batch'}
          </Button>
        </div>
      )}

      {publishedQuiz && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            Published — students in this batch have been notified
          </h2>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300">
            <Users2 className="h-4 w-4" aria-hidden />
            Attempts
          </h3>
          {attempts === null ? (
            <CardSkeleton />
          ) : attempts.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">No attempts yet.</p>
          ) : (
            <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
              {attempts.map((attempt) => (
                <div key={attempt.id} className="flex items-center justify-between px-6 py-3">
                  <p className="text-sm text-neutral-900 dark:text-neutral-100">
                    {attempt.display_name ?? attempt.student_id.slice(0, 8)}
                  </p>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    {attempt.score}/{attempt.total}
                  </p>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function QuestionCard({
  draftId,
  question,
  editable,
  onSaved,
}: {
  draftId: string;
  question: QuizDraftQuestion;
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
    difficulty: question.difficulty,
  });

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/quizzes/${draftId}/questions/${question.id}`, form);
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
      <Card>
        <div className="flex items-start justify-between gap-3">
          <p className="font-medium text-neutral-900 dark:text-neutral-50">{question.question_text}</p>
          <span className="shrink-0 text-xs capitalize text-neutral-400 dark:text-neutral-500">
            {question.difficulty}
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
        {editable && (
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </Card>
    );
  }

  return (
    <Card>
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
      <div className="mt-3">
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
      <div className="mt-4 flex gap-2">
        <Button onClick={() => void save()} disabled={saving} loading={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
