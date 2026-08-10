'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { QuizTakeResponse } from '@/lib/types';
import { Card, PageHeader, PageLoading, Button, InlineError, Badge } from '@/components/ui';

export default function StudentQuizTakePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const quizId = params.id;

  const [data, setData] = useState<QuizTakeResponse | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.get<QuizTakeResponse>(`/quizzes/${quizId}/take`).then(setData);
  }, [quizId]);

  async function submit() {
    if (!data) return;
    // `answers` is keyed by each question's position in the sorted-by-
    // orderIndex list below (the same order the radio inputs use), so
    // building the payload in that same order keeps the two in sync.
    const answerArray = data.questions
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((_, idx) => answers[idx]);
    if (answerArray.some((a) => a === undefined)) {
      setError('Answer every question before submitting.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/quizzes/${quizId}/submit`, { answers: answerArray });
      const refreshed = await api.get<QuizTakeResponse>(`/quizzes/${quizId}/take`);
      setData(refreshed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your answers.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {data === null ? (
        <>
          <button
            onClick={() => router.push('/student/quizzes')}
            className="mb-4 flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to quizzes
          </button>
          <PageLoading />
        </>
      ) : (
        <>
          <PageHeader
            title={data.quiz.title}
            description={
              data.attempted
                ? `You scored ${data.score}/${data.total}`
                : 'Answer every question, then submit. One attempt only.'
            }
            back={{ href: '/student/quizzes', label: 'Back to quizzes' }}
          />

          <div className="space-y-4">
            {data.questions
              .slice()
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map((q, idx) => (
                <Card key={q.id}>
                  <p className="mb-3 font-medium text-neutral-900 dark:text-neutral-50">
                    {idx + 1}. {q.questionText}
                  </p>
                  <div className="space-y-2">
                    {q.choices.map((choice, choiceIdx) => {
                      const isChosen = data.attempted
                        ? q.chosenChoiceIndex === choiceIdx
                        : answers[idx] === choiceIdx;
                      const isCorrect = data.attempted && q.correctChoiceIndex === choiceIdx;
                      const isWrongChosen = data.attempted && isChosen && !isCorrect;

                      return (
                        <label
                          key={choiceIdx}
                          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                            data.attempted
                              ? isCorrect
                                ? 'border-success bg-success-bg dark:bg-success/10'
                                : isWrongChosen
                                  ? 'border-error bg-error-bg dark:bg-error/10'
                                  : 'border-neutral-200 dark:border-neutral-800'
                              : isChosen
                                ? 'border-brand-600 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/15'
                                : 'border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`question-${idx}`}
                            disabled={data.attempted}
                            checked={isChosen}
                            onChange={() => setAnswers((prev) => ({ ...prev, [idx]: choiceIdx }))}
                            className="accent-brand-600"
                          />
                          <span className="text-neutral-800 dark:text-neutral-200">{choice}</span>
                          {data.attempted && isCorrect && (
                            <CheckCircle2
                              className="ml-auto h-4 w-4 text-success dark:text-success-dark"
                              aria-hidden
                            />
                          )}
                          {data.attempted && isWrongChosen && (
                            <XCircle className="ml-auto h-4 w-4 text-error dark:text-error-dark" aria-hidden />
                          )}
                        </label>
                      );
                    })}
                  </div>
                </Card>
              ))}
          </div>

          {!data.attempted && (
            <>
              {error && (
                <div className="mt-4">
                  <InlineError>{error}</InlineError>
                </div>
              )}
              <Button className="mt-4" disabled={submitting} loading={submitting} onClick={() => void submit()}>
                Submit answers
              </Button>
            </>
          )}

          {data.attempted && (
            <div className="mt-4">
              <Badge variant="brand">
                Final score: {data.score}/{data.total}
              </Badge>
            </div>
          )}
        </>
      )}
    </div>
  );
}
