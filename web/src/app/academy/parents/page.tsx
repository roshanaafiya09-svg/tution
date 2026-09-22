'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Phone, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import type { AcademyParentSummary } from '@/lib/types';
import { CardSkeleton, EmptyState, ErrorState, StatusBadge } from '@/components/ui';
import { AcademyCard, AcademyPageIntro, AcademySetupBanner } from '@/components/academy';
import { useAcademyDashboard } from '@/components/academy-shell';

export default function AcademyParentsPage() {
  const router = useRouter();
  const { hasAcademy } = useAcademyDashboard();
  const [parents, setParents] = useState<AcademyParentSummary[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (hasAcademy === false) {
      setParents([]);
      return;
    }
    setLoadError(null);
    try {
      setParents(await api.get<AcademyParentSummary[]>('/academy/me/parents'));
    } catch (err: unknown) {
      setLoadError(err ?? true);
    }
  }, [hasAcademy]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <AcademySetupBanner />
      <AcademyPageIntro eyebrow="Academy Dashboard" title="Parents" description="Parents connected to students in your academy." />

      <div className="mt-8">
        {loadError ? (
          <ErrorState error={loadError} what="parents" onRetry={() => void load()} />
        ) : parents === null ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : parents.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title="No parents yet"
            description="Parents appear here once they link to a student enrolled at your academy."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {parents.map((p) => {
              const label = p.children[0]?.displayName ? `Parent of ${p.children[0].displayName}` : 'Parent';
              return (
                <AcademyCard
                  key={p.parentId}
                  interactive
                  onClick={() => router.push(`/academy/parents/${p.parentId}`)}
                  className="flex items-start gap-3"
                >
                  <UserRound
                    className="h-10 w-10 shrink-0 rounded-full bg-brand-50 p-2 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{label}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                      <Phone className="h-3 w-3" aria-hidden />
                      {p.phoneE164}
                    </p>
                    {p.email && (
                      <p className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                        <Mail className="h-3 w-3" aria-hidden />
                        {p.email}
                      </p>
                    )}
                    <p className="mt-1.5 text-xs text-neutral-400 dark:text-neutral-500">
                      {p.childrenCount} {p.childrenCount === 1 ? 'child' : 'children'}: {p.children.map((c) => c.displayName ?? 'Student').join(', ')}
                    </p>
                    <div className="mt-1.5">
                      <StatusBadge status={p.children.some((c) => c.status === 'active') ? 'active' : 'left'} />
                    </div>
                  </div>
                </AcademyCard>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
