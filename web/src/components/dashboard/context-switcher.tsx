'use client';

import { Building2, Check, ChevronsUpDown, UserRound } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';
import { useTeachingContext, type TeachingProfile } from '@/components/teaching-context-provider';

function ProfileIcon({ profile, className }: { profile: TeachingProfile; className?: string }) {
  const Icon = profile.kind === 'academy' ? Building2 : UserRound;
  return <Icon className={className} aria-hidden />;
}

/**
 * The teacher's profile switcher: one account, separate contexts.
 * Individual Teaching is the teacher's own private business; each Academy is
 * a separate context whose classes, students and records belong to that
 * academy. Switching never copies, merges or moves anything — it only
 * changes which dataset the whole dashboard shows.
 */
export function ContextSwitcher() {
  const { current, profiles, switchTo } = useTeachingContext();
  const academy = current.kind === 'academy';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Teaching profile: ${current.label}. Switch profile`}
          className={cn(
            'flex max-w-[13rem] items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:shadow-focus-ring sm:max-w-[16rem]',
            academy
              ? 'border-brand-300 bg-brand-50 text-brand-800 hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-950/40 dark:text-brand-200 dark:hover:bg-brand-900/40'
              : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800',
          )}
        >
          <ProfileIcon profile={current} className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">{current.label}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[17rem]">
        <div className="px-2.5 py-1.5 text-xs text-neutral-400 dark:text-neutral-500">Switch profile</div>
        {profiles.map((profile, index) => (
          <div key={profile.value}>
            {index === 1 && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={() => switchTo(profile.value)} className="items-start gap-2.5">
              <ProfileIcon profile={profile} className="mt-0.5 h-4 w-4 text-neutral-400" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{profile.label}</span>
                <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                  {profile.kind === 'academy'
                    ? "Academy classes & students — paid for by the academy"
                    : 'Your own private students & classes — your plan'}
                </span>
              </span>
              {profile.value === current.value && <Check className="mt-0.5 h-4 w-4 text-brand-600" aria-hidden />}
            </DropdownMenuItem>
          </div>
        ))}
        {profiles.length === 1 && (
          <div className="px-2.5 pb-2 pt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Join an academy to add an Academy profile here.
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
