'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type {
  PublishedQuiz,
  QuizAttemptSummary,
  QuizDifficulty,
  QuizDraftDetail,
  QuizDraftQuestion,
} from '@/lib/types';
import { Card, PageHeader, StatusBadge, Button, Field, inputClass } from '@/components/ui';

export default function QuizDraftPage() {
  const { id } = useParams<{ id: string }>();
  const [draft, setDraft] = useState<QuizDraftDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [publishedQuiz, setPublishedQuiz] = useState<PublishedQuiz | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [attempts, setAttempts] = useState<QuizAttemptSummary[] | null>(null);

  const load = useCallback(async () => {
    setDraft(await api.get<QuizDraftDetail>(`/quizzes/${id}`));
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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not publish this quiz.');
    } finally {
      setPublishing(false);
    }
  }

  if (!draft) return <p className="text-sm text-neutral-400">Loading…</p>;

  return (
    <div>
      <PageHeader
        title="Quiz draft"
        description="Review each question before approving — nothing reaches students until you publish."
        action={<StatusBadge status={draft.status} />}
      />

      {error && <p className="mb-4 text-sm text-error">{error}</p>}

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
          <Button onClick={() => void review('approve')} disabled={reviewing}>
            {reviewing ? 'Saving…' : 'Approve'}
          </Button>
          <Button variant="danger" onClick={() => void review('reject')} disabled={reviewing}>
            Reject
          </Button>
        </div>
      )}

      {draft.status === 'approved' && (
        <div className="mt-6">
          <Button onClick={() => void publish()} disabled={publishing}>
            {publishing ? 'Publishing…' : 'Publish to batch'}
          </Button>
        </div>
      )}

      {publishedQuiz && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-neutral-900">
            Published — students in this batch have been notified
          </h2>
          <h3 className="mb-2 text-sm font-medium text-neutral-700">Attempts</h3>
          {attempts === null ? (
            <p className="text-sm text-neutral-400">Loading…</p>
          ) : attempts.length === 0 ? (
            <p className="text-sm text-neutral-500">No attempts yet.</p>
          ) : (
            <Card className="divide-y divide-neutral-100 p-0">
              {attempts.map((attempt) => (
                <div key={attempt.id} className="flex items-center justify-between px-6 py-3">
                  <p className="text-sm text-neutral-900">
                    {attempt.display_name ?? attempt.student_id.slice(0, 8)}
                  </p>
                  <p className="text-sm font-medium text-neutral-900">
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
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <Card>
        <div className="flex items-start justify-between">
          <p className="font-medium text-neutral-900">{question.question_text}</p>
          <span className="text-xs capitalize text-neutral-400">{question.difficulty}</span>
        </div>
        <ul className="mt-3 space-y-1">
          {question.choices.map((choice, i) => (
            <li
              key={i}
              className={`text-sm ${
                i === question.correct_choice_index
                  ? 'font-medium text-success'
                  : 'text-neutral-600'
              }`}
            >
              {i === question.correct_choice_index ? '✓ ' : ''}
              {choice}
            </li>
          ))}
        </ul>
        {editable && (
          <Button variant="secondary" className="mt-3" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <Field label="Question">
        <input
          className={inputClass}
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
            />
            <input
              className={`${inputClass} flex-1`}
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
          <select
            className={inputClass}
            value={form.difficulty}
            onChange={(e) => setForm({ ...form, difficulty: e.target.value as QuizDifficulty })}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </Field>
      </div>
      <div className="mt-4 flex gap-2">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
