import Link from 'next/link';
import { BookMarked } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EmptyState, buttonVariants } from '@/components/ui';

/** The one root-cause empty state that recurs across My Batches, Doubts,
 *  and Quizzes: nothing else on the page can be true until the student has
 *  joined a batch, so every one of these points at the same two ways to
 *  fix that — matches the spec's own "No batches" example (§16). */
export function NoBatchesEmptyState({
  icon = BookMarked,
  description = "Ask your tutor for an invite link, or find a teacher to get started.",
}: {
  icon?: LucideIcon;
  description?: string;
}) {
  return (
    <EmptyState
      icon={icon}
      title="You haven't joined a batch yet"
      description={description}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/student/find-a-teacher" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
            Find a Teacher
          </Link>
          <Link href="/student/find-an-academy" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            Find an Academy
          </Link>
        </div>
      }
    />
  );
}
