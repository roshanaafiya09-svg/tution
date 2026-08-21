'use client';

import { useEffect, useState } from 'react';
import { usePathname, useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, User } from 'lucide-react';
import { api, apiGetPublic, formatMinor } from '@/lib/api';
import type { Batch, Subject } from '@/lib/types';
import { CardSkeleton, ErrorState, EmptyState } from '@/components/ui';
import { TabNav, type TabItem } from '@/components/dashboard/tab-nav';
import { BatchWorkspaceContext } from '@/components/student';

type WorkspaceTabId =
  | 'overview'
  | 'schedule'
  | 'assignments'
  | 'materials'
  | 'quizzes'
  | 'attendance'
  | 'announcements'
  | 'doubts';

const TABS: (TabItem<WorkspaceTabId> & { href: string })[] = [
  { id: 'overview', label: 'Overview', href: '' },
  { id: 'schedule', label: 'Schedule', href: '/schedule' },
  { id: 'assignments', label: 'Assignments', href: '/assignments' },
  { id: 'materials', label: 'Materials', href: '/materials' },
  { id: 'quizzes', label: 'Quizzes', href: '/quizzes' },
  { id: 'attendance', label: 'Attendance', href: '/attendance' },
  { id: 'announcements', label: 'Announcements', href: '/announcements' },
  { id: 'doubts', label: 'Doubts & Help', href: '/doubts' },
];

/**
 * The batch-scoped "learning space" — a dedicated Overview/Schedule/
 * Assignments/Materials/Quizzes/Attendance/Announcements/Doubts & Help
 * mini-site for one batch, per the Student Dashboard redesign spec §4.
 * Resolves the batch client-side from the student's own `/batches/enrolled`
 * list (no dedicated single-batch student-read endpoint exists) — works
 * fine for direct/bookmarked navigation since this fetches fresh on mount
 * rather than relying on cached state from the My Batches list page.
 */
export default function BatchWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();

  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoadError(false);
    setBatches(null);
    setSubjects(null);
    Promise.all([api.get<Batch[]>('/batches/enrolled'), apiGetPublic<Subject[]>('/catalog/subjects')])
      .then(([b, s]) => {
        setBatches(b);
        setSubjects(s);
      })
      .catch(() => setLoadError(true));
  }, [id]);

  if (loadError) {
    return (
      <ErrorState
        description="Could not load this batch. Check your connection and try again."
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (batches === null || subjects === null) {
    return (
      <div className="space-y-6">
        <CardSkeleton className="h-24 rounded-2xl" />
        <CardSkeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const batch = batches.find((b) => b.id === id);
  if (!batch) {
    return (
      <EmptyState title="Batch not found" description="This batch doesn't exist, or you're not enrolled in it." />
    );
  }

  const subjectName = subjects.find((s) => s.id === batch.subject_id)?.name_i18n.en;
  const basePath = `/student/batches/${id}`;
  const activeTab =
    TABS.slice()
      .reverse()
      .find((t) => (t.href === '' ? pathname === basePath : pathname.startsWith(`${basePath}${t.href}`)))?.id ??
    'overview';

  return (
    <BatchWorkspaceContext.Provider value={{ batch, subjectName, subjects }}>
      <div className="space-y-6">
        <div>
          <Link
            href="/student/batches"
            className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            My Batches
          </Link>
          <h1 className="font-display text-3xl font-semibold text-neutral-900 dark:text-neutral-50 sm:text-[2.25rem]">
            {batch.title}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-500 dark:text-neutral-400">
            {subjectName && <span>{subjectName}</span>}
            {batch.tutor_display_name && (
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" aria-hidden />
                {batch.tutor_display_name}
              </span>
            )}
            <span>
              {formatMinor(batch.fee_minor, batch.currency)} / {batch.fee_period.replace('_', ' ')}
            </span>
          </p>
        </div>

        <TabNav
          tabs={TABS}
          value={activeTab}
          label="Batch sections"
          onChange={(next) => {
            const tab = TABS.find((t) => t.id === next);
            if (tab) router.push(`${basePath}${tab.href}`);
          }}
        />

        {children}
      </div>
    </BatchWorkspaceContext.Provider>
  );
}
