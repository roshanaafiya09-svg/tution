'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleDollarSign, CheckCircle2, AlertCircle, Wallet, Users, Search } from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import type { Batch, FeeEntry, FeeTotals } from '@/lib/types';
import {
  Card,
  PageHeader,
  EmptyState,
  StatusBadge,
  Button,
  Input,
  Select,
  CardSkeleton,
  ErrorState,
  StatCard,
  InlineError,
  useToast,
} from '@/components/ui';

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function StepLabel({ step, children }: { step: number; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">
        {step}
      </span>
      {children}
    </span>
  );
}

export default function FeesPage() {
  const toast = useToast();
  const [period, setPeriod] = useState(currentPeriod());
  const [entries, setEntries] = useState<FeeEntry[] | null>(null);
  const [totals, setTotals] = useState<FeeTotals | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState('');
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid'>('all');

  const load = useCallback(() => {
    setLoadError(false);
    setEntries(null);
    setTotals(null);
    Promise.all([
      api.get<FeeEntry[]>(`/fees/period?period=${period}`),
      api.get<FeeTotals>(`/fees/period/totals?period=${period}`),
    ])
      .then(([e, t]) => {
        setEntries(e);
        setTotals(t);
      })
      .catch(() => setLoadError(true));
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    void api.get<Batch[]>('/batches/me').then((rows) => {
      setBatches(rows.filter((b) => b.status === 'active'));
    });
  }, []);

  async function generate() {
    if (!selectedBatch) return;
    setGenerateError(null);
    setGenerating(true);
    try {
      await api.post(`/fees/batch/${selectedBatch}/generate`, { periodLabel: period });
      load();
      toast({ title: 'Fees generated', variant: 'success' });
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Could not generate fees for this batch.');
    } finally {
      setGenerating(false);
    }
  }

  async function recordPayment(entry: FeeEntry) {
    setRecordingId(entry.id);
    try {
      await api.post(`/fees/${entry.id}/record-payment`, { paidMinor: entry.expected_minor });
      load();
      toast({ title: 'Marked as paid', variant: 'success' });
    } catch {
      toast({ title: 'Could not record this payment', variant: 'error' });
    } finally {
      setRecordingId(null);
    }
  }

  const matchesQuery = (e: FeeEntry) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (e.display_name ?? e.phone_e164).toLowerCase().includes(q);
  };

  const unpaid = (entries ?? []).filter((e) => (e.status === 'due' || e.status === 'partial') && matchesQuery(e));
  const settled = (entries ?? []).filter((e) => (e.status === 'paid' || e.status === 'waived') && matchesQuery(e));
  const showUnpaid = statusFilter !== 'paid';
  const showSettled = statusFilter !== 'pending';

  return (
    <div>
      <PageHeader title="Fees" description="Who has paid this month, and who hasn't." />

      <Card className="mb-6">
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <StepLabel step={1}>Select month</StepLabel>
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <StepLabel step={2}>Select batch</StepLabel>
            <Select value={selectedBatch} onChange={(e) => setSelectedBatch(e.target.value)}>
              <option value="">Select a batch</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <StepLabel step={3}>Generate fee records</StepLabel>
            <Button onClick={() => void generate()} disabled={!selectedBatch || generating} loading={generating}>
              {generating ? 'Generating…' : 'Generate'}
            </Button>
          </div>
        </div>

        {generateError && (
          <div className="mt-4">
            <InlineError>{generateError}</InlineError>
          </div>
        )}
      </Card>

      {entries === null ? (
        loadError ? (
          <ErrorState description="Could not load fees for this period. Check your connection and try again." onRetry={load} />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
            <CardSkeleton />
          </div>
        )
      ) : entries.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nothing tracked for this month"
          description="Select a batch and month above, then generate this month's fees to start tracking."
        />
      ) : (
        <>
          {totals && totals.entries > 0 && (
            <div className="mb-8 grid gap-4 sm:grid-cols-4">
              <StatCard
                icon={CircleDollarSign}
                label="Expected"
                value={formatMinor(totals.expectedMinor, totals.currency)}
              />
              <StatCard
                icon={CheckCircle2}
                label="Collected"
                value={
                  <span className="text-success dark:text-success-dark">
                    {formatMinor(totals.collectedMinor, totals.currency)}
                  </span>
                }
              />
              <StatCard
                icon={AlertCircle}
                label="Outstanding"
                value={
                  <span className="text-warning dark:text-warning-dark">
                    {formatMinor(totals.outstandingMinor, totals.currency)}
                  </span>
                }
              />
              <StatCard icon={Users} label="Paid" value={`${totals.paidCount}/${totals.entries}`} />
            </div>
          )}

          <div className="mb-6 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by student name"
                className="pl-9"
              />
            </div>
            <div className="flex gap-1.5">
              {(['all', 'pending', 'paid'] as const).map((option) => (
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

          {showUnpaid && unpaid.length > 0 && (
            <>
              <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                Not yet paid ({unpaid.length})
              </h2>
              <Card className="mb-8 divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
                {unpaid.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between px-6 py-3">
                    <div>
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                        {entry.display_name ?? entry.phone_e164}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {entry.batch_title} · {formatMinor(entry.expected_minor, entry.currency)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={entry.status} />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void recordPayment(entry)}
                        disabled={recordingId === entry.id}
                        loading={recordingId === entry.id}
                      >
                        {recordingId === entry.id ? 'Saving…' : 'Mark paid'}
                      </Button>
                    </div>
                  </div>
                ))}
              </Card>
            </>
          )}

          {showSettled && settled.length > 0 && (
            <>
              <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                Settled ({settled.length})
              </h2>
              <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
                {settled.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between px-6 py-3">
                    <div>
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                        {entry.display_name ?? entry.phone_e164}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {entry.batch_title} ·{' '}
                        {formatMinor(entry.recorded_paid_minor ?? 0, entry.currency)}
                      </p>
                    </div>
                    <StatusBadge status={entry.status} />
                  </div>
                ))}
              </Card>
            </>
          )}

          {((showUnpaid && unpaid.length === 0) || !showUnpaid) &&
            ((showSettled && settled.length === 0) || !showSettled) && (
              <p className="py-10 text-center text-sm text-neutral-400 dark:text-neutral-500">
                No fee records match your search or filter.
              </p>
            )}
        </>
      )}
    </div>
  );
}
