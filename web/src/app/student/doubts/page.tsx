'use client';

import { useCallback, useEffect, useState } from 'react';
import { HelpCircle, Send, Lock } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { Batch, DoubtTurn } from '@/lib/types';
import {
  Card,
  PageHeader,
  EmptyState,
  PageLoading,
  CardSkeleton,
  ErrorState,
  Button,
  Textarea,
  InlineError,
  Badge,
} from '@/components/ui';

export default function StudentDoubtsPage() {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [history, setHistory] = useState<DoubtTurn[] | null>(null);
  const [question, setQuestion] = useState('');
  const [attemptText, setAttemptText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [premiumRequired, setPremiumRequired] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    setBatches(null);
    api
      .get<Batch[]>('/batches/enrolled')
      .then((list) => {
        setBatches(list);
        if (list.length > 0) setBatchId((current) => current ?? list[0].id);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function loadHistory(id: string) {
    const list = await api.get<DoubtTurn[]>(`/doubt-solver/batch/${id}/history`);
    setHistory(list);
  }

  useEffect(() => {
    if (batchId) void loadHistory(batchId);
  }, [batchId]);

  async function ask() {
    if (!batchId || !question.trim()) return;
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
    if (!batchId || !attemptText.trim()) return;
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
    <div>
      <PageHeader title="Doubts / Help" description="Ask a question about anything from your classes." />

      {batches === null ? (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : loadError ? (
        <ErrorState description="Could not load your batches. Check your connection and try again." onRetry={load} />
      ) : batches.length === 0 ? (
        <EmptyState icon={HelpCircle} title="No batches yet" description="Join a batch to start asking questions." />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {batches.map((b) => (
              <button
                key={b.id}
                onClick={() => setBatchId(b.id)}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                  batchId === b.id
                    ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/15 dark:text-brand-200'
                    : 'border-neutral-300 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800'
                }`}
              >
                {b.title}
              </button>
            ))}
          </div>

          {premiumRequired && (
            <Card className="border-warning bg-warning-bg dark:bg-warning/10">
              <div className="flex items-start gap-2">
                <Lock className="mt-0.5 h-4 w-4 text-warning" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    Ask a tutor requires Parent Premium
                  </p>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                    This feature needs an active Parent Premium subscription linked to your account. Ask your
                    parent to upgrade to unlock it.
                  </p>
                </div>
              </div>
            </Card>
          )}

          <Card>
            <p className="mb-2 text-sm font-medium text-neutral-900 dark:text-neutral-50">Ask a question</p>
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What are you stuck on?"
              rows={3}
            />
            {error && (
              <div className="mt-3">
                <InlineError>{error}</InlineError>
              </div>
            )}
            <Button className="mt-3" disabled={!question.trim() || busy} loading={busy} onClick={() => void ask()}>
              <Send className="h-3.5 w-3.5" aria-hidden />
              Ask
            </Button>
          </Card>

          {history === null ? (
            <PageLoading />
          ) : history.length === 0 ? (
            <EmptyState icon={HelpCircle} title="No questions yet" description="Ask your first question above." />
          ) : (
            <div className="space-y-3">
              {history.map((turn) => (
                <Card key={turn.id}>
                  <div className="flex items-center gap-2">
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
                  <p className="mt-2 text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    {turn.questionText}
                  </p>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{turn.answerText}</p>

                  {turn.awaitingAttempt && (
                    <div className="mt-4 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                      <p className="mb-2 text-sm text-neutral-500 dark:text-neutral-400">
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
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
