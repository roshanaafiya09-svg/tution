'use client';

import { useEffect, useState } from 'react';
import { HelpCircle, Send, Lock, Sparkles } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { DoubtTurn } from '@/lib/types';
import { EmptyState, PageLoading, Button, Textarea, InlineError, Badge } from '@/components/ui';
import { AcademicCard, ConversationTurn } from '@/components/student';

/** The AI doubt-solver chat for one fixed batch — self-contained (owns its
 *  own history fetch/ask/attempt mutations) since it's inherently
 *  interactive, unlike the presentational `*List` components. Shared by the
 *  global Doubts & Help page (which wraps it in a batch-pill selector, one
 *  batch active at a time) and each batch workspace's Doubts & Help tab
 *  (which renders it directly for its one fixed batch, no pill row). */
export function DoubtsPanel({ batchId }: { batchId: string }) {
  const [history, setHistory] = useState<DoubtTurn[] | null>(null);
  const [question, setQuestion] = useState('');
  const [attemptText, setAttemptText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [premiumRequired, setPremiumRequired] = useState(false);

  async function loadHistory(id: string) {
    const list = await api.get<DoubtTurn[]>(`/doubt-solver/batch/${id}/history`);
    setHistory(list);
  }

  useEffect(() => {
    setHistory(null);
    void loadHistory(batchId);
  }, [batchId]);

  async function ask() {
    if (!question.trim()) return;
    setError(null);
    setPremiumRequired(false);
    setBusy(true);
    try {
      await api.post('/doubt-solver/ask', { batchId, question: question.trim() });
      setQuestion('');
      await loadHistory(batchId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setPremiumRequired(true);
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not send your question.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitAttempt(hintId: string) {
    if (!attemptText.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await api.post(`/doubt-solver/${hintId}/attempt`, { attemptText: attemptText.trim() });
      setAttemptText('');
      await loadHistory(batchId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your attempt.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {premiumRequired && (
        <AcademicCard className="border-warning/30 bg-warning-bg dark:border-warning-dark/20 dark:bg-warning/10">
          <div className="flex items-start gap-2">
            <Lock className="mt-0.5 h-4 w-4 text-warning" aria-hidden />
            <div>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">Ask a tutor requires Parent Premium</p>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                This feature needs an active Parent Premium subscription linked to your account. Ask your parent to
                upgrade to unlock it.
              </p>
            </div>
          </div>
        </AcademicCard>
      )}

      {history === null ? (
        <PageLoading />
      ) : history.length === 0 ? (
        <EmptyState icon={HelpCircle} title="No questions yet" description="Ask your first question below." />
      ) : (
        <div className="space-y-5">
          {history.map((turn) => (
            <div key={turn.id} className="space-y-2">
              <ConversationTurn role="question">
                <p className="text-sm">{turn.questionText}</p>
              </ConversationTurn>

              <ConversationTurn role="answer">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-brand-500 dark:text-brand-300" aria-hidden />
                  <Badge variant={turn.kind === 'full_answer' ? 'brand' : 'neutral'}>
                    {turn.kind === 'full_answer' ? 'Full answer' : 'Hint'}
                  </Badge>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">
                    {new Date(turn.createdAt).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">{turn.answerText}</p>

                {turn.awaitingAttempt && (
                  <div className="mt-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                    <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
                      Try it yourself first to unlock the full answer:
                    </p>
                    <Textarea
                      value={attemptText}
                      onChange={(e) => setAttemptText(e.target.value)}
                      placeholder="What did you try?"
                      rows={2}
                    />
                    <Button
                      className="mt-2"
                      size="sm"
                      disabled={!attemptText.trim() || busy}
                      loading={busy}
                      onClick={() => void submitAttempt(turn.id)}
                    >
                      Submit attempt
                    </Button>
                  </div>
                )}
              </ConversationTurn>
            </div>
          ))}
        </div>
      )}

      <AcademicCard className="sticky bottom-4">
        <p className="mb-2 text-sm font-medium text-neutral-900 dark:text-neutral-50">Ask a question</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What are you stuck on?"
            rows={2}
            className="flex-1"
          />
          <Button disabled={!question.trim() || busy} loading={busy} onClick={() => void ask()} className="sm:shrink-0">
            <Send className="h-3.5 w-3.5" aria-hidden />
            Ask
          </Button>
        </div>
        {error && (
          <div className="mt-3">
            <InlineError>{error}</InlineError>
          </div>
        )}
      </AcademicCard>
    </div>
  );
}
