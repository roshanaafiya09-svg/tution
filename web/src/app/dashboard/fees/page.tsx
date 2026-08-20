'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  CircleDollarSign,
  Percent,
  Search,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import type { Batch, FeeEntry, FeeTotals } from '@/lib/types';
import {
  Button,
  buttonVariants,
  CardSkeleton,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  ErrorState,
  Field,
  InlineError,
  Input,
  Select,
  StatusBadge,
  Table,
  TableContainer,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from '@/components/ui';
import { TeacherPageHeader, AcademicCard, EmptyPanel, MetricCard, SectionHeader } from '@/components/dashboard';

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function FeesPage() {
  const toast = useToast();
  const [period, setPeriod] = useState(currentPeriod());
  const [entries, setEntries] = useState<FeeEntry[] | null>(null);
  const [totals, setTotals] = useState<FeeTotals | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [batches, setBatches] = useState<Batch[]>([]);

  const [generateOpen, setGenerateOpen] = useState(false);
  const [generatePeriod, setGeneratePeriod] = useState(currentPeriod());
  const [selectedBatch, setSelectedBatch] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [toWaive, setToWaive] = useState<FeeEntry | null>(null);
  const [query, setQuery] = useState('');
  const [batchFilter, setBatchFilter] = useState('all');

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
    void api
      .get<Batch[]>('/batches/me')
      .then((rows) => setBatches(rows.filter((b) => b.status === 'active')))
      .catch(() => setBatches([]));
  }, []);

  async function generate() {
    if (!selectedBatch) return;
    setGenerateError(null);
    setGenerating(true);
    try {
      await api.post(`/fees/batch/${selectedBatch}/generate`, { periodLabel: generatePeriod });
      setPeriod(generatePeriod);
      setGenerateOpen(false);
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

  async function waive(entry: FeeEntry) {
    await api.post(`/fees/${entry.id}/waive`, {});
    load();
    toast({ title: 'Fee waived', variant: 'success' });
  }

  const matches = useCallback(
    (entry: FeeEntry) => {
      if (batchFilter !== 'all' && entry.batch_id !== batchFilter) return false;
      const needle = query.trim().toLowerCase();
      if (!needle) return true;
      return (
        (entry.display_name ?? entry.phone_e164).toLowerCase().includes(needle) ||
        entry.batch_title.toLowerCase().includes(needle)
      );
    },
    [batchFilter, query],
  );

  const outstanding = useMemo(
    () => (entries ?? []).filter((e) => (e.status === 'due' || e.status === 'partial') && matches(e)),
    [entries, matches],
  );
  const settled = useMemo(
    () => (entries ?? []).filter((e) => (e.status === 'paid' || e.status === 'waived') && matches(e)),
    [entries, matches],
  );

  const collectionRate =
    totals && totals.expectedMinor > 0 ? Math.round((totals.collectedMinor / totals.expectedMinor) * 100) : null;

  const generateAction = (
    <Button size="sm" onClick={() => setGenerateOpen(true)} disabled={batches.length === 0}>
      <Sparkles className="h-3.5 w-3.5" aria-hidden />
      Generate monthly fees
    </Button>
  );

  return (
    <div className="space-y-5">
      <TeacherPageHeader
        eyebrow="Business"
        title="Fees"
        description="What you're owed, what's come in, and who still needs a nudge."
        action={generateAction}
      />

      {loadError ? (
        <ErrorState
          description="Could not load fees for this period. Check your connection and try again."
          onRetry={load}
        />
      ) : entries === null ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <CardSkeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
          <CardSkeleton className="h-56 rounded-2xl" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={CheckCircle2}
              label="Collected this month"
              value={formatMinor(totals?.collectedMinor ?? 0, totals?.currency ?? 'INR')}
              hint={totals ? `${totals.paidCount} of ${totals.entries} students` : undefined}
              tone="success"
            />
            <MetricCard
              icon={AlertCircle}
              label="Outstanding"
              value={formatMinor(totals?.outstandingMinor ?? 0, totals?.currency ?? 'INR')}
              hint={`${outstanding.length} student${outstanding.length === 1 ? '' : 's'} to chase`}
              tone={(totals?.outstandingMinor ?? 0) > 0 ? 'warning' : 'success'}
            />
            <MetricCard
              icon={CircleDollarSign}
              label="Expected"
              value={formatMinor(totals?.expectedMinor ?? 0, totals?.currency ?? 'INR')}
              hint={`${totals?.entries ?? 0} fee record${(totals?.entries ?? 0) === 1 ? '' : 's'}`}
              tone="neutral"
            />
            <MetricCard
              icon={Percent}
              label="Collection rate"
              value={collectionRate === null ? '—' : `${collectionRate}%`}
              hint={collectionRate === null ? 'Nothing generated yet' : `For ${period}`}
              tone={collectionRate !== null && collectionRate < 60 ? 'warning' : 'brand'}
              href="/dashboard/earnings"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
              <span className="shrink-0">Month</span>
              <Input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                aria-label="Fee period"
                className="w-auto"
              />
            </label>
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search student or batch…"
                aria-label="Search fees"
                className="w-full pl-9"
              />
            </div>
            <Select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              aria-label="Filter by batch"
              className="w-auto"
            >
              <option value="all">All batches</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.title}
                </option>
              ))}
            </Select>
          </div>

          {entries.length === 0 ? (
            <EmptyPanel
              icon={Wallet}
              title={`Nothing tracked for ${period}`}
              description="Generate this month's fees for a batch and every enrolled student gets a fee record you can mark paid as money comes in."
              steps={['Pick a batch', 'Generate fees', 'Record payments', 'Watch collection rate']}
              action={
                batches.length === 0 ? (
                  <Link href="/dashboard/batches" className={buttonVariants({ size: 'sm' })}>
                    Create a batch first
                  </Link>
                ) : (
                  generateAction
                )
              }
            />
          ) : (
            <>
              <SectionHeader
                eyebrow="Chase these"
                title={`Outstanding fees (${outstanding.length})`}
                className="mb-0 pt-2"
              />
              {outstanding.length === 0 ? (
                <p className="flex items-center gap-2 rounded-xl border border-neutral-200/70 bg-white px-4 py-3 text-sm text-neutral-500 dark:border-neutral-800/80 dark:bg-surface dark:text-neutral-400">
                  <CheckCircle2 className="h-4 w-4 text-success dark:text-success-dark" aria-hidden />
                  Everything for {period} is settled.
                </p>
              ) : (
                <>
                  <TableContainer className="hidden rounded-2xl border-neutral-200/70 md:block dark:border-neutral-800/80">
                    <Table>
                      <THead>
                        <TR>
                          <TH>Student</TH>
                          <TH>Batch</TH>
                          <TH>Amount</TH>
                          <TH>Period</TH>
                          <TH>Status</TH>
                          <TH className="text-right">Actions</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {outstanding.map((entry) => (
                          <TR key={entry.id}>
                            <TD className="font-medium text-neutral-900 dark:text-neutral-50">
                              <Link href={`/dashboard/students/${entry.student_id}`} className="hover:underline">
                                {entry.display_name ?? entry.phone_e164}
                              </Link>
                            </TD>
                            <TD>{entry.batch_title}</TD>
                            <TD className="tabular-nums">
                              {formatMinor(entry.expected_minor, entry.currency)}
                              {entry.recorded_paid_minor ? (
                                <span className="block text-xs text-neutral-400 dark:text-neutral-500">
                                  {formatMinor(entry.recorded_paid_minor, entry.currency)} received
                                </span>
                              ) : null}
                            </TD>
                            <TD>{entry.period_label}</TD>
                            <TD>
                              <StatusBadge status={entry.status} />
                            </TD>
                            <TD>
                              <div className="flex justify-end gap-2">
                                <Link
                                  href={`/dashboard/students/${entry.student_id}`}
                                  className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                                >
                                  View
                                </Link>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => void recordPayment(entry)}
                                  disabled={recordingId === entry.id}
                                  loading={recordingId === entry.id}
                                >
                                  Mark paid
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setToWaive(entry)}>
                                  Waive
                                </Button>
                              </div>
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </TableContainer>

                  <ul className="space-y-2.5 md:hidden">
                    {outstanding.map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-sm dark:border-neutral-800/80 dark:bg-surface"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link
                              href={`/dashboard/students/${entry.student_id}`}
                              className="block truncate font-medium text-neutral-900 dark:text-neutral-50"
                            >
                              {entry.display_name ?? entry.phone_e164}
                            </Link>
                            <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
                              {entry.batch_title} · {entry.period_label}
                            </p>
                          </div>
                          <StatusBadge status={entry.status} />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <span className="font-display text-lg font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
                            {formatMinor(entry.expected_minor, entry.currency)}
                          </span>
                          <span className="flex gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => void recordPayment(entry)}
                              disabled={recordingId === entry.id}
                              loading={recordingId === entry.id}
                            >
                              Mark paid
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setToWaive(entry)}>
                              Waive
                            </Button>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {settled.length > 0 && (
                <>
                  <SectionHeader eyebrow="Done" title={`Settled (${settled.length})`} className="mb-0 pt-3" />
                  <AcademicCard className="p-0">
                    <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                      {settled.map((entry) => (
                        <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                          <div className="min-w-0">
                            <Link
                              href={`/dashboard/students/${entry.student_id}`}
                              className="block truncate text-sm font-medium text-neutral-900 hover:underline dark:text-neutral-50"
                            >
                              {entry.display_name ?? entry.phone_e164}
                            </Link>
                            <p className="truncate text-xs text-neutral-400 dark:text-neutral-500">
                              {entry.batch_title} ·{' '}
                              {formatMinor(entry.recorded_paid_minor ?? 0, entry.currency)}
                              {entry.paid_at
                                ? ` · ${new Date(entry.paid_at).toLocaleDateString('en-IN')}`
                                : ''}
                            </p>
                          </div>
                          <StatusBadge status={entry.status} />
                        </li>
                      ))}
                    </ul>
                  </AcademicCard>
                </>
              )}

              {outstanding.length === 0 && settled.length === 0 && (
                <p className="rounded-2xl border border-dashed border-neutral-300 px-5 py-8 text-center text-sm text-neutral-400 dark:border-neutral-700/70 dark:text-neutral-500">
                  No fee records match your search or filter.
                </p>
              )}
            </>
          )}
        </>
      )}

      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent
          title="Generate monthly fees"
          description="Creates one fee record per enrolled student in the batch, using the batch's own monthly fee. Running it again for the same month won't duplicate records."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Month">
              <Input type="month" value={generatePeriod} onChange={(e) => setGeneratePeriod(e.target.value)} />
            </Field>
            <Field label="Batch">
              <Select value={selectedBatch} onChange={(e) => setSelectedBatch(e.target.value)}>
                <option value="">Select a batch</option>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.title}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {generateError && (
            <div className="mt-3">
              <InlineError>{generateError}</InlineError>
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setGenerateOpen(false)} disabled={generating}>
              Cancel
            </Button>
            <Button onClick={() => void generate()} disabled={!selectedBatch || generating} loading={generating}>
              {generating ? 'Generating…' : 'Generate fees'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={toWaive !== null}
        onOpenChange={(open) => !open && setToWaive(null)}
        onConfirm={() => (toWaive ? waive(toWaive) : Promise.resolve())}
        title="Waive this fee?"
        description={
          toWaive
            ? `${toWaive.display_name ?? toWaive.phone_e164}'s ${formatMinor(
                toWaive.expected_minor,
                toWaive.currency,
              )} for ${toWaive.period_label} will be marked waived and drop out of what you're owed.`
            : ''
        }
        confirmLabel="Waive fee"
      />
    </div>
  );
}
