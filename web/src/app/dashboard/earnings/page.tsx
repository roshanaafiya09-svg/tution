'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CircleDollarSign, Landmark, TrendingUp, Wallet } from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import type { FeeTotals, Payout } from '@/lib/types';
import { buttonVariants, CardSkeleton, ErrorState, StatusBadge } from '@/components/ui';
import { TeacherPageHeader, AcademicCard, EmptyPanel, MetricCard, SectionHeader } from '@/components/dashboard';
import { cn } from '@/lib/cn';

const MONTHS_SHOWN = 6;

function recentPeriods(count: number): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  });
}

function monthLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'short' });
}

export default function EarningsPage() {
  const [totals, setTotals] = useState<FeeTotals[] | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loadError, setLoadError] = useState(false);
  const periods = recentPeriods(MONTHS_SHOWN);

  const load = useCallback(() => {
    setLoadError(false);
    setTotals(null);
    Promise.all([
      Promise.all(
        periods.map((period) =>
          api.get<FeeTotals>(`/fees/period/totals?period=${period}`).catch(
            (): FeeTotals => ({
              periodLabel: period,
              expectedMinor: 0,
              collectedMinor: 0,
              outstandingMinor: 0,
              entries: 0,
              paidCount: 0,
              currency: 'INR',
            }),
          ),
        ),
      ),
      api.get<Payout[]>('/payouts/me').catch(() => [] as Payout[]),
    ])
      .then(([totalRows, payoutRows]) => {
        setTotals(totalRows);
        setPayouts(payoutRows);
      })
      .catch(() => setLoadError(true));
    // `periods` is derived from today's date and stable within a render pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const thisMonth = totals?.[totals.length - 1] ?? null;
  const currency = thisMonth?.currency ?? 'INR';
  const collectedTotal = (totals ?? []).reduce((sum, t) => sum + t.collectedMinor, 0);
  const outstandingTotal = (totals ?? []).reduce((sum, t) => sum + t.outstandingMinor, 0);
  const expectedTotal = (totals ?? []).reduce((sum, t) => sum + t.expectedMinor, 0);
  const collectionRate = expectedTotal === 0 ? null : Math.round((collectedTotal / expectedTotal) * 100);
  const peak = Math.max(1, ...(totals ?? []).map((t) => Math.max(t.expectedMinor, t.collectedMinor)));
  const paidOut = payouts
    .filter((p) => p.status === 'completed')
    .reduce((sum, p) => sum + p.amount_minor, 0);
  const hasAnyFeeData = (totals ?? []).some((t) => t.entries > 0);

  return (
    <div className="space-y-5">
      <TeacherPageHeader
        eyebrow="Business"
        title="Earnings"
        description="What you've collected month by month, and the payouts settled to your account."
        action={
          <Link href="/dashboard/fees" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            <Wallet className="h-3.5 w-3.5" aria-hidden />
            Manage fees
          </Link>
        }
      />

      {loadError ? (
        <ErrorState description="Could not load your earnings. Check your connection and try again." onRetry={load} />
      ) : totals === null ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CardSkeleton className="h-24 rounded-2xl" />
            <CardSkeleton className="h-24 rounded-2xl" />
            <CardSkeleton className="h-24 rounded-2xl" />
            <CardSkeleton className="h-24 rounded-2xl" />
          </div>
          <CardSkeleton className="h-56 rounded-2xl" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={CircleDollarSign}
              label="Collected this month"
              value={formatMinor(thisMonth?.collectedMinor ?? 0, currency)}
              hint={thisMonth ? `${thisMonth.paidCount}/${thisMonth.entries} students paid` : undefined}
              tone="success"
            />
            <MetricCard
              icon={Wallet}
              label="Outstanding"
              value={formatMinor(thisMonth?.outstandingMinor ?? 0, currency)}
              hint="This month"
              tone={(thisMonth?.outstandingMinor ?? 0) > 0 ? 'warning' : 'success'}
              href="/dashboard/fees"
            />
            <MetricCard
              icon={TrendingUp}
              label={`Collected · ${MONTHS_SHOWN} months`}
              value={formatMinor(collectedTotal, currency)}
              hint={collectionRate === null ? 'No fees generated yet' : `${collectionRate}% collection rate`}
            />
            <MetricCard
              icon={Landmark}
              label="Paid out"
              value={formatMinor(paidOut, currency)}
              hint={`${payouts.length} payout${payouts.length === 1 ? '' : 's'} on record`}
            />
          </div>

          <SectionHeader eyebrow="Trend" title={`Last ${MONTHS_SHOWN} months`} className="mb-0 pt-2" />
          <AcademicCard>
            {!hasAnyFeeData ? (
              <EmptyPanel
                icon={TrendingUp}
                title="No fee history yet"
                description="Once you generate monthly fees for a batch and record payments, your collection trend builds here automatically."
                action={
                  <Link href="/dashboard/fees" className={buttonVariants({ size: 'sm' })}>
                    Generate this month&apos;s fees
                  </Link>
                }
                className="border-0 bg-transparent p-0 dark:bg-transparent"
              />
            ) : (
              <>
                <div className="flex items-end gap-3 sm:gap-5">
                  {totals.map((month) => {
                    const collectedHeight = Math.round((month.collectedMinor / peak) * 100);
                    const expectedHeight = Math.round((month.expectedMinor / peak) * 100);
                    return (
                      <div key={month.periodLabel} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                        <div className="flex h-32 w-full items-end justify-center gap-1">
                          <div
                            className="w-1/3 min-w-[0.5rem] rounded-t bg-neutral-200 transition-all duration-slow dark:bg-neutral-800"
                            style={{ height: `${Math.max(2, expectedHeight)}%` }}
                            title={`Expected ${formatMinor(month.expectedMinor, month.currency)}`}
                          />
                          <div
                            className={cn(
                              'w-1/3 min-w-[0.5rem] rounded-t transition-all duration-slow',
                              month.collectedMinor > 0 ? 'bg-brand-500 dark:bg-brand-400' : 'bg-neutral-100 dark:bg-neutral-900',
                            )}
                            style={{ height: `${Math.max(2, collectedHeight)}%` }}
                            title={`Collected ${formatMinor(month.collectedMinor, month.currency)}`}
                          />
                        </div>
                        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                          {monthLabel(month.periodLabel)}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-neutral-100 pt-3 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm bg-brand-500 dark:bg-brand-400" aria-hidden />
                    Collected
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm bg-neutral-200 dark:bg-neutral-800" aria-hidden />
                    Expected
                  </span>
                  <span className="ml-auto">
                    {formatMinor(outstandingTotal, currency)} still outstanding across these months
                  </span>
                </div>
              </>
            )}
          </AcademicCard>

          <SectionHeader
            eyebrow="Settlements"
            title="Payouts"
            action={{ href: '/dashboard/billing', label: 'Subscription & billing' }}
            className="mb-0 pt-2"
          />
          {payouts.length === 0 ? (
            <EmptyPanel
              icon={Landmark}
              title="No payouts yet"
              description="Payouts appear here once students pay fees online and a payout run settles that money to you. Fees you record manually are tracked on the Fees page instead."
            />
          ) : (
            <AcademicCard className="p-0">
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {payouts.map((payout) => (
                  <li key={payout.id} className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                        {formatMinor(payout.amount_minor, payout.currency)}
                      </p>
                      <p className="text-xs text-neutral-400 dark:text-neutral-500">
                        {new Date(payout.period_start).toLocaleDateString('en-IN')} –{' '}
                        {new Date(payout.period_end).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                    <StatusBadge status={payout.status} />
                  </li>
                ))}
              </ul>
            </AcademicCard>
          )}
        </>
      )}
    </div>
  );
}
