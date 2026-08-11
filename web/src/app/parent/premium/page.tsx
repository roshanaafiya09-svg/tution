'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, FileText, TrendingUp, ArrowRight } from 'lucide-react';
import { api, formatMinor } from '@/lib/api';
import { payForOrder } from '@/lib/razorpay';
import type { ParentPremiumStatus, PaymentOrder, SubscriptionPlan } from '@/lib/types';
import { PageHeader, InlineError, PageLoading, Button } from '@/components/ui';
import { ParentCard, ParentSectionHeader, PremiumStatusCard } from '@/components/parent';

const BENEFITS = [
  {
    icon: FileText,
    title: 'Richer weekly digests',
    description: 'A more detailed AI summary each week, with an added focus-area paragraph beyond the free tier.',
  },
  {
    icon: TrendingUp,
    title: 'More attendance & score detail',
    description: "Your child's weekly digest includes deeper attendance and submission breakdowns.",
  },
];

export default function ParentPremiumPage() {
  const [status, setStatus] = useState<ParentPremiumStatus | null>(null);
  const [plans, setPlans] = useState<Record<string, SubscriptionPlan> | null>(null);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([
      api.get<ParentPremiumStatus>('/parent-premium/me'),
      api.get<Record<string, SubscriptionPlan>>('/parent-premium/plans'),
    ]);
    setStatus(s);
    setPlans(p);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function purchase(planId: string) {
    setError(null);
    setPurchasing(planId);
    try {
      const order = await api.post<PaymentOrder>('/payments/parent-premium/order', { planId });
      await payForOrder(order, {
        name: 'Scholar Parent Premium',
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

  const isActive = status?.status === 'active';

  return (
    <div>
      <PageHeader
        eyebrow="Parent Premium"
        title="Parent Premium"
        description="Richer weekly digests for your child, with more attendance and score detail."
      />

      {error && (
        <div className="mb-4">
          <InlineError>{error}</InlineError>
        </div>
      )}

      {status === null ? (
        <PageLoading />
      ) : (
        <div className="space-y-8">
          <PremiumStatusCard status={status} />

          <section>
            <ParentSectionHeader eyebrow={isActive ? 'Included with your plan' : 'Why upgrade'} title="Benefits" />
            <div className="grid gap-4 sm:grid-cols-2">
              {BENEFITS.map((b) => (
                <ParentCard key={b.title} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300">
                    <b.icon className="h-5 w-5" aria-hidden />
                  </div>
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-neutral-50">{b.title}</p>
                    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{b.description}</p>
                  </div>
                </ParentCard>
              ))}
            </div>
          </section>

          {isActive ? (
            <Link
              href="/parent"
              className="flex items-center gap-1.5 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
            >
              View your children&apos;s digests
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : (
            plans && (
              <section>
                <ParentSectionHeader eyebrow="Pricing" title="Choose a plan" />
                <div className="grid gap-4 sm:grid-cols-2">
                  {Object.entries(plans).map(([planId, plan]) => (
                    <ParentCard key={planId} className="flex flex-col gap-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                          <Sparkles className="h-4 w-4" aria-hidden />
                        </div>
                        <div>
                          <p className="font-medium text-neutral-900 dark:text-neutral-50">{plan.label}</p>
                          <p className="mt-1 font-display text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
                            {formatMinor(plan.priceMinor, 'INR')}
                          </p>
                          <p className="text-sm text-neutral-500 dark:text-neutral-400">every {plan.periodDays} days</p>
                        </div>
                      </div>
                      <Button
                        onClick={() => void purchase(planId)}
                        disabled={purchasing === planId}
                        loading={purchasing === planId}
                        className="w-full"
                      >
                        {purchasing === planId ? 'Processing…' : 'Subscribe'}
                      </Button>
                    </ParentCard>
                  ))}
                </div>
              </section>
            )
          )}
        </div>
      )}
    </div>
  );
}
