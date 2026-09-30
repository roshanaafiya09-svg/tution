import { Sparkles } from 'lucide-react';
import { ParentCard } from './parent-card';
import { StatusBadge } from '@/components/ui';
import type { ParentPremiumStatus } from '@/lib/types';

/** The status header on the Premium page — active or not, with the
 *  renewal date when known. Reused as-is regardless of subscription
 *  state so the page never has two competing "status" treatments.
 *  Always reads `effectiveStatus`: the raw row can still say 'active'
 *  after the paid period lapsed (audit H2). */
function statusDetail(status: ParentPremiumStatus): string | null {
  const end = status.currentPeriodEnd
    ? new Date(status.currentPeriodEnd).toLocaleDateString('en-IN')
    : null;
  switch (status.effectiveStatus) {
    case 'active':
      return end ? `Renews ${end}` : null;
    case 'expired':
      return end
        ? `Your plan ended on ${end} — resubscribe below to restore access.`
        : 'Your plan has ended — resubscribe below to restore access.';
    case 'cancelled':
    case 'past_due':
      return 'Your subscription lapsed — resubscribe to restore access.';
    default:
      return 'Not subscribed yet — see plans below.';
  }
}

export function PremiumStatusCard({ status }: { status: ParentPremiumStatus }) {
  const isActive = status.effectiveStatus === 'active';
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
            {status.effectiveStatus.replace(/_/g, ' ')}
          </p>
          {detail && <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{detail}</p>}
        </div>
      </div>
      <StatusBadge status={status.effectiveStatus} />
    </ParentCard>
  );
}
