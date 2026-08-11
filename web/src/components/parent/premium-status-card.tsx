import { Sparkles } from 'lucide-react';
import { ParentCard } from './parent-card';
import { StatusBadge } from '@/components/ui';
import type { ParentPremiumStatus } from '@/lib/types';

/** The status header on the Premium page — active or not, with the
 *  renewal date when known. Reused as-is regardless of subscription
 *  state so the page never has two competing "status" treatments. */
export function PremiumStatusCard({ status }: { status: ParentPremiumStatus }) {
  const isActive = status.status === 'active';

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
          {status.currentPeriodEnd && (
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Renews {new Date(status.currentPeriodEnd).toLocaleDateString('en-IN')}
            </p>
          )}
        </div>
      </div>
      <StatusBadge status={status.status} />
    </ParentCard>
  );
}
