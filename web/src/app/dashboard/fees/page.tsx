'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, formatMinor } from '@/lib/api';
import type { Batch, FeeEntry, FeeTotals } from '@/lib/types';
import {
  Card,
  PageHeader,
  EmptyState,
  StatusBadge,
  Button,
  Field,
  inputClass,
} from '@/components/ui';

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
          <input
            type="month"
            className={inputClass}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </Field>
        <Field label="Generate for batch">
          <select
            className={inputClass}
            value={selectedBatch}
            onChange={(e) => setSelectedBatch(e.target.value)}
          >
            <option value="">Select a batch</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </Field>
        <Button onClick={() => void generate()} disabled={!selectedBatch}>
          Generate
        </Button>
      </div>

      {totals && totals.entries > 0 && (
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-sm text-neutral-500">Expected</p>
            <p className="mt-1 font-display text-2xl font-semibold text-neutral-900">
              {formatMinor(totals.expectedMinor, totals.currency)}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-neutral-500">Collected</p>
            <p className="mt-1 font-display text-2xl font-semibold text-success">
              {formatMinor(totals.collectedMinor, totals.currency)}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-neutral-500">Outstanding</p>
            <p className="mt-1 font-display text-2xl font-semibold text-warning">
              {formatMinor(totals.outstandingMinor, totals.currency)}
            </p>
          </Card>
        </div>
      )}

      {entries === null ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : entries.length === 0 ? (
        <EmptyState
          title="Nothing tracked for this month"
          description="Pick a batch above and generate this month's fees to start tracking."
        />
      ) : (
        <>
          {unpaid.length > 0 && (
            <>
              <h2 className="mb-3 text-lg font-semibold text-neutral-900">
                Not yet paid ({unpaid.length})
              </h2>
              <Card className="mb-8 divide-y divide-neutral-100 p-0">
                {unpaid.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between px-6 py-3">
                    <div>
                      <p className="text-sm font-medium text-neutral-900">
                        {entry.display_name ?? entry.phone_e164}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {entry.batch_title} · {formatMinor(entry.expected_minor, entry.currency)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={entry.status} />
                      <Button
                        variant="secondary"
                        onClick={() => void recordPayment(entry)}
                        disabled={recordingId === entry.id}
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
              <h2 className="mb-3 text-lg font-semibold text-neutral-900">
                Settled ({settled.length})
              </h2>
              <Card className="divide-y divide-neutral-100 p-0">
                {settled.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between px-6 py-3">
                    <div>
                      <p className="text-sm font-medium text-neutral-900">
                        {entry.display_name ?? entry.phone_e164}
                      </p>
                      <p className="text-xs text-neutral-500">
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
