import { Sparkles } from 'lucide-react';
import { ParentCard } from './parent-card';
import { StatusBadge } from '@/components/ui';
import type { ParentPremiumStatus } from '@/lib/types';

/** The status header on the Premium page — active or not, with the
 *  renewal date when known. Reused as-is regardless of subscription
 *  state so the page never has two competing "status" treatments. */
function statusDetail(status: ParentPremiumStatus): string | null {
  if (status.status === 'active') {
    return status.currentPeriodEnd
      ? `Renews ${new Date(status.currentPeriodEnd).toLocaleDateString('en-IN')}`
      : null;
  }
  if (status.status === 'cancelled' || status.status === 'past_due') {
    return 'Your subscription lapsed — resubscribe to restore access.';
  }
  // 'inactive'
  return status.currentPeriodEnd ? null : 'Not subscribed yet — see plans below.';
}

export function PremiumStatusCard({ status }: { status: ParentPremiumStatus }) {
  const isActive = status.status === 'active';
  const detail = statusDetail(status);

  return (
    <ParentCard
      className={
        isActive
          ? 'flex items-center justify-between gap-4 border-accent-200 bg-gradient-to-br from-accent-50 via-white to-white dark:border-accent-500/30 dark:from-accent-500/10 dark:via-transparent dark:to-transparent'
          : 'flex items-center justify-between gap-4'
      }
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300">
          <Sparkles className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Status</p>
          <p className="mt-1 font-display text-2xl font-semibold capitalize text-neutral-900 dark:text-neutral-50">
            {status.status.replace(/_/g, ' ')}
          </p>
          {detail && <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{detail}</p>}
        </div>
      </div>
      <StatusBadge status={status.status} />
    </ParentCard>
  );
}
