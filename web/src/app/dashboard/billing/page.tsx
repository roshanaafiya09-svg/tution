'use client';

import { useCallback, useEffect, useState } from 'react';
import { GraduationCap, ClipboardCheck, Wallet, Landmark, Sparkles, Users } from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import { payForOrder } from '@/lib/razorpay';
import type {
  PaymentOrder,
  Payout,
  SubscriptionCapacity,
  SubscriptionPlan,
  SubscriptionRecap,
} from '@/lib/types';
import {
  StatusBadge,
  Button,
  InlineError,
  CardSkeleton,
  ErrorState,
  StatCard,
  ConfirmDialog,
  useToast,
} from '@/components/ui';
import { TeacherPageHeader, AcademicCard, EmptyPanel, SectionHeader } from '@/components/dashboard';

export default function BillingPage() {
  const toast = useToast();
  const [recap, setRecap] = useState<SubscriptionRecap | null>(null);
  const [plans, setPlans] = useState<Record<string, SubscriptionPlan> | null>(null);
  const [capacity, setCapacity] = useState<SubscriptionCapacity | null>(null);
  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [planToConfirm, setPlanToConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    Promise.all([
      api.get<SubscriptionRecap>('/subscriptions/recap'),
      api.get<Record<string, SubscriptionPlan>>('/subscriptions/plans'),
      api.get<SubscriptionCapacity>('/subscriptions/capacity'),
      api.get<Payout[]>('/payouts/me'),
    ])
      .then(([r, p, c, po]) => {
        setRecap(r);
        setPlans(p);
        setCapacity(c);
        setPayouts(po);
      })
      .catch((err: unknown) => setLoadError(err ?? true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function purchase(planId: string) {
    setError(null);
    setPurchasing(planId);
    try {
      // If this plan's own blocks wouldn't cover the students already
      // active, buy the shortfall as extra blocks up front — the backend
      // would otherwise reject an order that can't cover current usage
      // (audit H1). The backend still prices and validates this; the
      // frontend is only choosing a sensible default, never the authority.
      const plan = plans?.[planId];
      const extraBlocks =
        plan && capacity
          ? Math.max(0, capacity.blocksRequired - plan.blocks)
          : 0;
      const order = await api.post<PaymentOrder>('/payments/subscription/order', {
        planId,
        ...(extraBlocks > 0 ? { extraBlocks } : {}),
      });
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

  async function purchaseAddBlocks(blocks: number) {
    setError(null);
    setPurchasing('add-blocks');
    try {
      const order = await api.post<PaymentOrder>('/payments/subscription/add-blocks-order', {
        blocks,
      });
      await payForOrder(order, {
        name: 'Scholar — extra student blocks',
        description: `${blocks} extra block${blocks === 1 ? '' : 's'} of 25 students`,
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
        <ErrorState error={loadError} what="your subscription" onRetry={load} />
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

          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={GraduationCap} label="Classes run" value={recap.classesRun} />
            <StatCard icon={ClipboardCheck} label="Attendances marked" value={recap.attendancesMarked} />
            <StatCard
              icon={Wallet}
              label="Fees tracked"
              value={formatMinor(recap.feesTrackedMinor, recap.currency)}
            />
            {capacity && (
              <StatCard
                icon={Users}
                label="Students"
                value={
                  capacity.capacityStudents === null
                    ? `${capacity.activeStudents} (unlimited on trial)`
                    : `${capacity.activeStudents} of ${capacity.capacityStudents}`
                }
              />
            )}
          </div>

          {/* Every 25-student block is enforced server-side at enrolment —
              this is a heads-up, not the enforcement layer (audit H1). */}
          {capacity && capacity.blocksShort > 0 && (
            <div className="mb-8 space-y-3">
              <InlineError>
                {isPaid
                  ? `Your ${capacity.purchasedBlocks} purchased block${capacity.purchasedBlocks === 1 ? '' : 's'} ` +
                    `cover${capacity.purchasedBlocks === 1 ? 's' : ''} up to ${capacity.capacityStudents} students, but ` +
                    `${capacity.activeStudents} are already active. Add ${capacity.blocksShort} more block` +
                    `${capacity.blocksShort === 1 ? '' : 's'} of ${capacity.blockSize} to enrol more students.`
                  : `You have ${capacity.activeStudents} active students — that needs ${capacity.blocksRequired} block` +
                    `${capacity.blocksRequired === 1 ? '' : 's'} of ${capacity.blockSize}. This is covered automatically ` +
                    `when you subscribe below.`}
              </InlineError>
              {isPaid && (
                <Button
                  onClick={() => purchaseAddBlocks(capacity.blocksShort)}
                  disabled={purchasing === 'add-blocks'}
                  loading={purchasing === 'add-blocks'}
                >
                  Add {capacity.blocksShort} block{capacity.blocksShort === 1 ? '' : 's'}
                </Button>
              )}
            </div>
          )}

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
            <EmptyPanel
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
