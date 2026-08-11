'use client';

import { useCallback, useEffect, useState } from 'react';
import { GraduationCap, ClipboardCheck, Wallet, Landmark, Sparkles } from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import { payForOrder } from '@/lib/razorpay';
import type { PaymentOrder, Payout, SubscriptionPlan, SubscriptionRecap } from '@/lib/types';
import {
  EmptyState,
  StatusBadge,
  Button,
  InlineError,
  CardSkeleton,
  ErrorState,
  StatCard,
  ConfirmDialog,
  useToast,
} from '@/components/ui';
import { TeacherPageHeader, AcademicCard, SectionHeader } from '@/components/dashboard';

export default function BillingPage() {
  const toast = useToast();
  const [recap, setRecap] = useState<SubscriptionRecap | null>(null);
  const [plans, setPlans] = useState<Record<string, SubscriptionPlan> | null>(null);
  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [planToConfirm, setPlanToConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(false);
    Promise.all([
      api.get<SubscriptionRecap>('/subscriptions/recap'),
      api.get<Record<string, SubscriptionPlan>>('/subscriptions/plans'),
      api.get<Payout[]>('/payouts/me'),
    ])
      .then(([r, p, po]) => {
        setRecap(r);
        setPlans(p);
        setPayouts(po);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function purchase(planId: string) {
    setError(null);
    setPurchasing(planId);
    try {
      const order = await api.post<PaymentOrder>('/payments/subscription/order', { planId });
      await payForOrder(order, {
        name: 'Scholar subscription',
        description: plans?.[planId]?.label,
        onSettled: () => load(),
        onError: (message) => {
          setError(message);
          toast({ title: 'Payment did not complete', description: message, variant: 'error' });
        },
      });
    } catch {
      setError('Could not start checkout. Try again.');
      toast({ title: 'Could not start checkout', variant: 'error' });
    } finally {
      setPurchasing(null);
    }
  }

  const isPaid = recap?.subscriptionStatus === 'active';
  const trialDaysLeft = recap
    ? Math.max(0, Math.ceil((new Date(recap.trialEndsAt).getTime() - Date.now()) / 86_400_000))
    : null;
  const isTrialing = recap?.subscriptionStatus === 'trialing';

  const cheapestPerDay =
    plans && Object.keys(plans).length > 1
      ? Math.min(...Object.values(plans).map((p) => p.priceMinor / p.periodDays))
      : null;

  const confirmPlan = planToConfirm && plans ? plans[planToConfirm] : null;

  return (
    <div>
      <TeacherPageHeader
        eyebrow="Account"
        title="Subscription & billing"
        description="Your subscription, trial status, and money you've earned."
      />

      {error && (
        <div className="mb-4 mt-8">
          <InlineError>{error}</InlineError>
        </div>
      )}

      <div className="mt-8">
      {loadError ? (
        <ErrorState description="Could not load your subscription. Check your connection and try again." onRetry={load} />
      ) : recap === null ? (
        <div className="space-y-6">
          <CardSkeleton />
          <div className="grid gap-4 sm:grid-cols-3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        </div>
      ) : (
        <>
          <AcademicCard className="mb-6 border-brand-200 bg-brand-50/40 dark:border-brand-500/25 dark:bg-brand-500/5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-brand-600 dark:text-brand-300">
                  {isTrialing ? 'Trial plan' : 'Subscription status'}
                </p>
                <p className="mt-1 font-display text-2xl font-semibold capitalize text-neutral-900 dark:text-neutral-50">
                  {recap.subscriptionStatus.replace('_', ' ')}
                </p>
                {isTrialing && (
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                    Your trial includes full access to Scholar — batches, scheduling, attendance, fees, and
                    messaging.
                  </p>
                )}
              </div>
              {isTrialing && trialDaysLeft !== null && (
                <div className="text-right">
                  <p className="font-display text-3xl font-semibold text-brand-700 dark:text-brand-200">
                    {trialDaysLeft}
                  </p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">days remaining</p>
                </div>
              )}
            </div>
          </AcademicCard>

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
              <SectionHeader title="Plans" />
              <div className="mb-8 grid gap-4 sm:grid-cols-2">
                {Object.entries(plans).map(([planId, plan]) => {
                  const perDay = plan.priceMinor / plan.periodDays;
                  const bestValue = cheapestPerDay !== null && perDay <= cheapestPerDay;
                  return (
                    <AcademicCard key={planId} className={bestValue ? 'border-brand-300 dark:border-brand-500/40' : undefined}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-neutral-900 dark:text-neutral-50">{plan.label}</p>
                        {bestValue && (
                          <span className="flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
                            <Sparkles className="h-3 w-3" aria-hidden />
                            Best value
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                        {formatMinor(plan.priceMinor, 'INR')} / {plan.periodDays} days ·{' '}
                        {formatMinor(Math.round(perDay), 'INR')}/day
                      </p>
                      <Button
                        className="mt-4"
                        onClick={() => setPlanToConfirm(planId)}
                        disabled={purchasing === planId}
                        loading={purchasing === planId}
                      >
                        {purchasing === planId ? 'Processing…' : 'Subscribe'}
                      </Button>
                    </AcademicCard>
                  );
                })}
              </div>
            </>
          )}

          <SectionHeader title="Payouts" />
          {payouts === null || payouts.length === 0 ? (
            <EmptyState
              icon={Landmark}
              title="No payouts yet"
              description="Payouts appear here once students pay fees online and a payout run settles them to you."
            />
          ) : (
            <AcademicCard className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
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
            </AcademicCard>
          )}
        </>
      )}
      </div>

      <ConfirmDialog
        open={planToConfirm !== null}
        onOpenChange={(open) => !open && setPlanToConfirm(null)}
        onConfirm={() => (planToConfirm ? purchase(planToConfirm) : Promise.resolve())}
        title="Confirm subscription"
        description={
          confirmPlan
            ? `You're about to subscribe to ${confirmPlan.label} for ${formatMinor(confirmPlan.priceMinor, 'INR')} (${confirmPlan.periodDays} days). You'll continue to a secure payment checkout next.`
            : ''
        }
        confirmLabel="Continue to payment"
        danger={false}
      />
    </div>
  );
}
