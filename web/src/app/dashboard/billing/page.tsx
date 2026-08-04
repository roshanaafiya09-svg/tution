'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, formatMinor } from '@/lib/api';
import { payForOrder } from '@/lib/razorpay';
import type { PaymentOrder, Payout, SubscriptionPlan, SubscriptionRecap } from '@/lib/types';
import { Card, PageHeader, EmptyState, StatusBadge, Button } from '@/components/ui';

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

      {error && <p className="mb-4 text-sm text-error">{error}</p>}

      {recap === null ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : (
        <>
          <Card className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500">Subscription status</p>
                <p className="mt-1 font-display text-2xl font-semibold text-neutral-900 capitalize">
                  {recap.subscriptionStatus.replace('_', ' ')}
                </p>
              </div>
              {!isPaid && trialDaysLeft !== null && (
                <p className="text-sm text-neutral-500">{trialDaysLeft} days left in trial</p>
              )}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-neutral-500">Classes run</p>
                <p className="mt-1 text-2xl font-semibold text-neutral-900">{recap.classesRun}</p>
              </div>
              <div>
                <p className="text-sm text-neutral-500">Attendances marked</p>
                <p className="mt-1 text-2xl font-semibold text-neutral-900">{recap.attendancesMarked}</p>
              </div>
              <div>
                <p className="text-sm text-neutral-500">Fees tracked</p>
                <p className="mt-1 text-2xl font-semibold text-neutral-900">
                  {formatMinor(recap.feesTrackedMinor, recap.currency)}
                </p>
              </div>
            </div>
          </Card>

          {!isPaid && plans && (
            <>
              <h2 className="mb-3 text-lg font-semibold text-neutral-900">Plans</h2>
              <div className="mb-8 grid gap-4 sm:grid-cols-2">
                {Object.entries(plans).map(([planId, plan]) => (
                  <Card key={planId} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-neutral-900">{plan.label}</p>
                      <p className="text-sm text-neutral-500">
                        {formatMinor(plan.priceMinor, 'INR')} / {plan.periodDays} days
                      </p>
                    </div>
                    <Button onClick={() => void purchase(planId)} disabled={purchasing === planId}>
                      {purchasing === planId ? 'Processing…' : 'Subscribe'}
                    </Button>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <h2 className="mb-3 text-lg font-semibold text-neutral-900">Payouts</h2>
      {payouts === null ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : payouts.length === 0 ? (
        <EmptyState
          title="No payouts yet"
          description="Payouts appear here once students pay fees online and a payout run settles them to you."
        />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0">
          {payouts.map((payout) => (
            <div key={payout.id} className="flex items-center justify-between px-6 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  {new Date(payout.period_start).toLocaleDateString('en-IN')} –{' '}
                  {new Date(payout.period_end).toLocaleDateString('en-IN')}
                </p>
                <p className="text-sm text-neutral-500">{formatMinor(payout.amount_minor, payout.currency)}</p>
              </div>
              <StatusBadge status={payout.status} />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
