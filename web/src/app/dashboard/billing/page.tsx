'use client';

import { useCallback, useEffect, useState } from 'react';
import { GraduationCap, ClipboardCheck, Wallet, Landmark } from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import { payForOrder } from '@/lib/razorpay';
import type { PaymentOrder, Payout, SubscriptionPlan, SubscriptionRecap } from '@/lib/types';
import { Card, PageHeader, EmptyState, StatusBadge, Button, InlineError, PageLoading, StatCard } from '@/components/ui';

export default function BillingPage() {
  const [recap, setRecap] = useState<SubscriptionRecap | null>(null);
  const [plans, setPlans] = useState<Record<string, SubscriptionPlan> | null>(null);
  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [r, p, po] = await Promise.all([
      api.get<SubscriptionRecap>('/subscriptions/recap'),
      api.get<Record<string, SubscriptionPlan>>('/subscriptions/plans'),
      api.get<Payout[]>('/payouts/me'),
    ]);
    setRecap(r);
    setPlans(p);
    setPayouts(po);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function purchase(planId: string) {
    setError(null);
    setPurchasing(planId);
    try {
      const order = await api.post<PaymentOrder>('/payments/subscription/order', { planId });
      await payForOrder(order, {
        name: 'Scholar subscription',
        description: plans?.[planId]?.label,
        onSettled: () => void load(),
        onError: (message) => setError(message),
      });
    } catch {
      setError('Could not start checkout. Try again.');
    } finally {
      setPurchasing(null);
    }
  }

  const isPaid = recap?.subscriptionStatus === 'active';
  const trialDaysLeft = recap
    ? Math.max(0, Math.ceil((new Date(recap.trialEndsAt).getTime() - Date.now()) / 86_400_000))
    : null;

  return (
    <div>
      <PageHeader title="Billing & payouts" description="Your subscription, trial status, and money you've earned." />

      {error && (
        <div className="mb-4">
          <InlineError>{error}</InlineError>
        </div>
      )}

      {recap === null ? (
        <PageLoading />
      ) : (
        <>
          <Card className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">Subscription status</p>
                <p className="mt-1 font-display text-2xl font-semibold capitalize text-neutral-900 dark:text-neutral-50">
                  {recap.subscriptionStatus.replace('_', ' ')}
                </p>
              </div>
              {!isPaid && trialDaysLeft !== null && (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {trialDaysLeft} days left in trial
                </p>
              )}
            </div>
          </Card>

          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            <StatCard icon={GraduationCap} label="Classes run" value={recap.classesRun} />
            <StatCard icon={ClipboardCheck} label="Attendances marked" value={recap.attendancesMarked} />
            <StatCard
              icon={Wallet}
              label="Fees tracked"
              value={formatMinor(recap.feesTrackedMinor, recap.currency)}
            />
          </div>

          {!isPaid && plans && (
            <>
              <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">Plans</h2>
              <div className="mb-8 grid gap-4 sm:grid-cols-2">
                {Object.entries(plans).map(([planId, plan]) => (
                  <Card key={planId} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-neutral-900 dark:text-neutral-50">{plan.label}</p>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        {formatMinor(plan.priceMinor, 'INR')} / {plan.periodDays} days
                      </p>
                    </div>
                    <Button
                      onClick={() => void purchase(planId)}
                      disabled={purchasing === planId}
                      loading={purchasing === planId}
                    >
                      {purchasing === planId ? 'Processing…' : 'Subscribe'}
                    </Button>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">Payouts</h2>
      {payouts === null ? (
        <PageLoading />
      ) : payouts.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No payouts yet"
          description="Payouts appear here once students pay fees online and a payout run settles them to you."
        />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
          {payouts.map((payout) => (
            <div key={payout.id} className="flex items-center justify-between px-6 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                  {new Date(payout.period_start).toLocaleDateString('en-IN')} –{' '}
                  {new Date(payout.period_end).toLocaleDateString('en-IN')}
                </p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {formatMinor(payout.amount_minor, payout.currency)}
                </p>
              </div>
              <StatusBadge status={payout.status} />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
