import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from './card';
import { cn } from '@/lib/cn';

/** Icon + label + big number — the KPI card shown near the top of every
 *  dashboard (Today, fees, billing, student/parent attendance, etc).
 *  Centralized so every dashboard renders this the same way. */
export function StatCard({
  icon: Icon,
  label,
  value,
  className,
  iconClassName = 'text-brand-500 dark:text-brand-300',
  children,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  className?: string;
  /** Override the icon's color — e.g. semantic success/error/warning for
   *  a "Present"/"Absent"/"Late" style stat. Defaults to the brand color. */
  iconClassName?: string;
  /** Optional extra content below the value — e.g. a trend line or a
   *  "View details" link. */
  children?: ReactNode;
}) {
  return (
    <Card className={cn('flex items-start gap-3', className)}>
      <Icon className={cn('mt-0.5 h-5 w-5', iconClassName)} aria-hidden />
      <div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{label}</p>
        <p className="mt-0.5 font-display text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
          {value}
        </p>
        {children}
      </div>
    </Card>
  );
}
