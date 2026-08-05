'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleDollarSign, CheckCircle2, AlertCircle, Wallet } from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import type { Batch, FeeEntry, FeeTotals } from '@/lib/types';
import { Card, PageHeader, EmptyState, StatusBadge, Button, Field, Input, Select, PageLoading } from '@/components/ui';

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function FeesPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const [entries, setEntries] = useState<FeeEntry[] | null>(null);
  const [totals, setTotals] = useState<FeeTotals | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState('');
  const [recordingId, setRecordingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setEntries(await api.get<FeeEntry[]>(`/fees/period?period=${period}`));
    setTotals(await api.get<FeeTotals>(`/fees/period/totals?period=${period}`));
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void api.get<Batch[]>('/batches/me').then((rows) => {
      setBatches(rows.filter((b) => b.status === 'active'));
    });
  }, []);

  async function generate() {
    if (!selectedBatch) return;
    await api.post(`/fees/batch/${selectedBatch}/generate`, { periodLabel: period });
    await load();
  }

  async function recordPayment(entry: FeeEntry) {
    setRecordingId(entry.id);
    try {
      await api.post(`/fees/${entry.id}/record-payment`, { paidMinor: entry.expected_minor });
      await load();
    } finally {
      setRecordingId(null);
    }
  }

  const unpaid = entries?.filter((e) => e.status === 'due' || e.status === 'partial') ?? [];
  const settled = entries?.filter((e) => e.status === 'paid' || e.status === 'waived') ?? [];

  return (
    <div>
      <PageHeader
        title="Fees"
        description="Who has paid this month, and who hasn't."
      />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <Field label="Period">
          <Input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </Field>
        <Field label="Generate for batch">
          <Select
            value={selectedBatch}
            onChange={(e) => setSelectedBatch(e.target.value)}
          >
            <option value="">Select a batch</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </Select>
        </Field>
        <Button onClick={() => void generate()} disabled={!selectedBatch}>
          Generate
        </Button>
      </div>

      {totals && totals.entries > 0 && (
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <Card className="flex items-start gap-3">
            <CircleDollarSign className="mt-0.5 h-5 w-5 text-brand-500 dark:text-brand-300" aria-hidden />
            <div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Expected</p>
              <p className="mt-0.5 font-display text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
                {formatMinor(totals.expectedMinor, totals.currency)}
              </p>
            </div>
          </Card>
          <Card className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-success dark:text-success-dark" aria-hidden />
            <div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Collected</p>
              <p className="mt-0.5 font-display text-2xl font-semibold text-success dark:text-success-dark">
                {formatMinor(totals.collectedMinor, totals.currency)}
              </p>
            </div>
          </Card>
          <Card className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-warning dark:text-warning-dark" aria-hidden />
            <div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Outstanding</p>
              <p className="mt-0.5 font-display text-2xl font-semibold text-warning dark:text-warning-dark">
                {formatMinor(totals.outstandingMinor, totals.currency)}
              </p>
            </div>
          </Card>
        </div>
      )}

      {entries === null ? (
        <PageLoading />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nothing tracked for this month"
          description="Pick a batch above and generate this month's fees to start tracking."
        />
      ) : (
        <>
          {unpaid.length > 0 && (
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

          {settled.length > 0 && (
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
        </>
      )}
    </div>
  );
}
