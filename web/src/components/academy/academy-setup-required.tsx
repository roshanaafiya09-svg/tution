import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { buttonVariants } from '@/components/ui';

/** Shown on every Academy Dashboard page except Today and Academy Profile
 *  when the account has no `academies` row yet — a page-appropriate nudge
 *  toward Academy Profile (the only page that renders the actual creation
 *  form), never the creation form itself. See academy-shell.tsx's nav
 *  guard: pages consult `useAcademyDashboard().hasAcademy` and render this
 *  in place of their normal content while it's `false`. */
export function AcademySetupRequired({ pageLabel }: { pageLabel: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-14 text-center dark:border-neutral-700 dark:bg-surface">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-500/15">
        <Building2 className="h-5 w-5 text-brand-600 dark:text-brand-300" aria-hidden />
      </div>
      <p className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">
        Set up your academy first
      </p>
      <p className="max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
        {pageLabel} unlocks once your academy profile exists — it only takes a name to get started.
      </p>
      <Link href="/academy/profile" className={buttonVariants({ size: 'sm' })}>
        Set up Academy Profile
      </Link>
    </div>
  );
}
