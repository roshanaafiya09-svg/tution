import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { buttonVariants } from '@/components/ui';
import { useAcademyDashboard } from '@/components/academy-shell';

/** Persistent, non-blocking notice shown across Academy Dashboard pages
 *  while the account has no `academies` row yet. Unlike `AcademySetupRequired`
 *  (which fully replaces a page's content), this sits alongside the page's
 *  normal — empty — content so the rest of Scholar's navigation and layout
 *  stays usable while the academy profile is being set up. Self-contained:
 *  reads `useAcademyDashboard()` itself and renders nothing once the academy
 *  exists, so call sites just drop it in unconditionally. */
export function AcademySetupBanner() {
  const { hasAcademy } = useAcademyDashboard();
  if (hasAcademy !== false) return null;

  return (
    <div className="mb-6 flex flex-col items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-brand-500/25 dark:bg-brand-500/10">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 dark:bg-surface dark:text-brand-300">
          <Building2 className="h-4 w-4" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">Academy profile incomplete</p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Complete your profile to unlock all Academy features.
          </p>
        </div>
      </div>
      <Link href="/academy/profile" className={buttonVariants({ size: 'sm', className: 'shrink-0' })}>
        Complete Academy Profile
      </Link>
    </div>
  );
}
