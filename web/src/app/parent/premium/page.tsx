'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, formatMinor } from '@/lib/api';
import { payForOrder } from '@/lib/razorpay';
import type { ParentPremiumStatus, PaymentOrder, SubscriptionPlan } from '@/lib/types';
import { Card, PageHeader, StatusBadge, Button } from '@/components/ui';

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
        title="Parent Premium"
        description="AI doubt solver for your child, plus richer weekly digests."
      />

      {error && <p className="mb-4 text-sm text-error">{error}</p>}

      {status === null ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : (
        <>
          <Card className="mb-8 flex items-center justify-between">
            <div>
              <p className="text-sm text-neutral-500">Status</p>
              <p className="mt-1 font-display text-2xl font-semibold capitalize text-neutral-900">
                {status.status}
              </p>
              {status.currentPeriodEnd && (
                <p className="mt-1 text-sm text-neutral-500">
                  Renews {new Date(status.currentPeriodEnd).toLocaleDateString('en-IN')}
                </p>
              )}
            </div>
            <StatusBadge status={status.status} />
          </Card>

          {!isActive && plans && (
            <div className="grid gap-4 sm:grid-cols-2">
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
          )}
        </>
      )}
    </div>
  );
}
