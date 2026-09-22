'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { AssessmentTakeResponse } from '@/lib/types';
import { Card, PageHeader, PageLoading, Button, InlineError, Badge, ErrorState } from '@/components/ui';

export default function StudentAssessmentTakePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const assessmentId = params.id;

  const [data, setData] = useState<AssessmentTakeResponse | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    setData(null);
    api
      .get<AssessmentTakeResponse>(`/assessments/online/${assessmentId}/take`)
      .then(setData)
      .catch((err: unknown) => setLoadError(err ?? true));
  }, [assessmentId]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    if (!data) return;
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
      await api.post(`/assessments/online/${assessmentId}/submit`, { answers: answerArray });
      // Reload through `load` (not an inline GET) so that if this refresh
      // fails, the student gets the retry card instead of a misleading
      // "could not submit" error for answers that were in fact saved.
      load();
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
            onClick={() => router.push('/student/assessments')}
            className="mb-4 flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to assessments
          </button>
          {loadError ? (
            <ErrorState error={loadError} what="this assessment" onRetry={load} />
          ) : (
            <PageLoading />
          )}
        </>
      ) : (
        <>
          <PageHeader
            title={data.assessment.title}
            description={
              data.attempted
                ? `You scored ${data.score}/${data.maxScore}`
                : data.open === false
                  ? 'This assessment has closed and can no longer be attempted.'
                  : 'Answer every question, then submit. One attempt only.'
            }
            back={{ href: '/student/assessments', label: 'Back to assessments' }}
          />

          {!data.attempted && data.open === false && (
            <Card>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                You didn&apos;t submit this assessment before it closed, so there is no score to show. Ask your tutor if
                you need another attempt.
              </p>
            </Card>
          )}

          <div className="space-y-4">
            {(!data.attempted && data.open === false ? [] : data.questions)
              .slice()
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map((q, idx) => (
                <Card key={q.id}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <p className="font-medium text-neutral-900 dark:text-neutral-50">
                      {idx + 1}. {q.questionText}
                    </p>
                    <span className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">
                      {q.marks} mark{q.marks === 1 ? '' : 's'}
                    </span>
                  </div>
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
                  {data.attempted && q.explanation && (
                    <p className="mt-3 text-xs text-neutral-400 dark:text-neutral-500">{q.explanation}</p>
                  )}
                </Card>
              ))}
          </div>

          {!data.attempted && data.open !== false && (
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
                Final score: {data.score}/{data.maxScore}
              </Badge>
            </div>
          )}
        </>
      )}
    </div>
  );
}
