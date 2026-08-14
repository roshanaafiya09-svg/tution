'use client';

import { useCallback, useEffect, useState } from 'react';
import { UserMinus, UserCheck, UserX, Users } from 'lucide-react';
import { api } from '@/lib/api';
import type { AcademyActiveTeacher, AcademyPendingRequest, AcademyRemovedTeacher } from '@/lib/types';
import { Button, CardSkeleton, ConfirmDialog, EmptyState, ErrorState, StatusBadge, useToast } from '@/components/ui';
import { AcademyCard, AcademyPageIntro } from '@/components/academy';
import { academyInitials } from '@/lib/academies';
import { cn } from '@/lib/cn';

type Tab = 'active' | 'pending' | 'removed';

const TABS: { key: Tab; label: string }[] = [
  { key: 'active', label: 'Active Teachers' },
  { key: 'pending', label: 'Pending Requests' },
  { key: 'removed', label: 'Past Teachers' },
];

export default function AcademyTeachersPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('active');
  const [active, setActive] = useState<AcademyActiveTeacher[] | null>(null);
  const [pending, setPending] = useState<AcademyPendingRequest[] | null>(null);
  const [removed, setRemoved] = useState<AcademyRemovedTeacher[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<
    { kind: 'accept' | 'reject' | 'remove'; id: string; name: string } | null
  >(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [activeRes, pendingRes, removedRes] = await Promise.all([
        api.get<AcademyActiveTeacher[]>('/academy/me/teachers/active'),
        api.get<AcademyPendingRequest[]>('/academy/me/teachers/pending'),
        api.get<AcademyRemovedTeacher[]>('/academy/me/teachers/removed'),
      ]);
      setActive(activeRes);
      setPending(pendingRes);
      setRemoved(removedRes);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleConfirm() {
    if (!confirmTarget) return;
    if (confirmTarget.kind === 'accept') {
      await api.post(`/academy/me/teachers/${confirmTarget.id}/accept`);
      toast({ title: `${confirmTarget.name} added to your academy`, variant: 'success' });
    } else if (confirmTarget.kind === 'reject') {
      await api.post(`/academy/me/teachers/${confirmTarget.id}/reject`);
      toast({ title: 'Request declined', variant: 'info' });
    } else {
      await api.delete(`/academy/me/teachers/${confirmTarget.id}`);
      toast({ title: `${confirmTarget.name} removed from your academy`, variant: 'success' });
    }
    await load();
  }

  if (loadError) {
    return (
      <ErrorState
        description="Could not load your teachers. Check your connection and try again."
        onRetry={() => void load()}
      />
    );
  }

  const loading = active === null || pending === null || removed === null;

  return (
    <div>
      <AcademyPageIntro eyebrow="Academy Dashboard" title="Teachers" description="Manage teacher membership requests and your active roster." />

      <div className="mt-8 mb-6 flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === t.key
                ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-200'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100',
            )}
          >
            {t.label}
            {t.key === 'pending' && pending && pending.length > 0 && (
              <span className="rounded-full bg-warning-bg px-1.5 py-0.5 text-xs font-semibold text-warning dark:bg-warning/15 dark:text-warning-dark">
                {pending.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : tab === 'active' ? (
        active.length === 0 ? (
          <EmptyState icon={Users} title="No active teachers yet" description="Accepted teacher requests will appear here." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {active.map((t) => (
              <AcademyCard key={t.membershipId} className="flex items-start gap-3">
                <Avatar name={t.displayName} url={t.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{t.displayName ?? 'Teacher'}</p>
                    {t.verificationStatus === 'verified' && <StatusBadge status="verified" />}
                  </div>
                  {t.headline && <p className="text-xs text-neutral-500 dark:text-neutral-400">{t.headline}</p>}
                  {t.yearsExperience != null && (
                    <p className="text-xs text-neutral-400 dark:text-neutral-500">{t.yearsExperience} years experience</p>
                  )}
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">
                    Joined {new Date(t.joinedAt).toLocaleDateString()}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <a
                      href={`/t/${t.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300"
                    >
                      View Profile
                    </a>
                    <button
                      type="button"
                      onClick={() => setConfirmTarget({ kind: 'remove', id: t.membershipId, name: t.displayName ?? 'This teacher' })}
                      className="flex items-center gap-1 text-xs font-medium text-error hover:underline dark:text-error-dark"
                    >
                      <UserMinus className="h-3 w-3" aria-hidden />
                      Remove from Academy
                    </button>
                  </div>
                </div>
              </AcademyCard>
            ))}
          </div>
        )
      ) : tab === 'pending' ? (
        pending.length === 0 ? (
          <EmptyState icon={Users} title="No pending requests" description="Teachers who request to join your academy will appear here." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {pending.map((r) => (
              <AcademyCard key={r.requestId} className="flex items-start gap-3">
                <Avatar name={r.displayName} url={r.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{r.displayName ?? 'Teacher'}</p>
                    {r.verificationStatus === 'verified' && <StatusBadge status="verified" />}
                  </div>
                  {r.headline && <p className="text-xs text-neutral-500 dark:text-neutral-400">{r.headline}</p>}
                  {r.yearsExperience != null && (
                    <p className="text-xs text-neutral-400 dark:text-neutral-500">{r.yearsExperience} years experience</p>
                  )}
                  {r.message && (
                    <p className="mt-1.5 rounded-md bg-neutral-50 p-2 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
                      &ldquo;{r.message}&rdquo;
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <a
                      href={`/t/${r.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300"
                    >
                      View Profile
                    </a>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => setConfirmTarget({ kind: 'accept', id: r.requestId, name: r.displayName ?? 'This teacher' })}
                    >
                      <UserCheck className="h-3.5 w-3.5" aria-hidden />
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setConfirmTarget({ kind: 'reject', id: r.requestId, name: r.displayName ?? 'This teacher' })}
                    >
                      <UserX className="h-3.5 w-3.5" aria-hidden />
                      Reject
                    </Button>
                  </div>
                </div>
              </AcademyCard>
            ))}
          </div>
        )
      ) : removed.length === 0 ? (
        <EmptyState icon={Users} title="No past teachers" description="Teachers removed from your academy will appear here." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {removed.map((t) => (
            <AcademyCard key={t.membershipId} className="flex items-start gap-3 opacity-80">
              <Avatar name={t.displayName} url={t.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{t.displayName ?? 'Teacher'}</p>
                {t.headline && <p className="text-xs text-neutral-500 dark:text-neutral-400">{t.headline}</p>}
                <p className="text-xs text-neutral-400 dark:text-neutral-500">
                  {new Date(t.joinedAt).toLocaleDateString()} – {t.leftAt ? new Date(t.leftAt).toLocaleDateString() : '—'}
                </p>
              </div>
            </AcademyCard>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
        onConfirm={handleConfirm}
        title={
          confirmTarget?.kind === 'accept'
            ? `Accept ${confirmTarget.name}?`
            : confirmTarget?.kind === 'reject'
              ? `Reject ${confirmTarget.name}'s request?`
              : `Remove ${confirmTarget?.name}?`
        }
        description={
          confirmTarget?.kind === 'accept'
            ? 'They will become an active member of your academy. Their teacher account stays fully independent.'
            : confirmTarget?.kind === 'reject'
              ? 'They will be notified that their request was declined. They can request again later.'
              : 'This only deactivates their academy membership — their teacher account, profile, batches, students, and reviews are never affected.'
        }
        confirmLabel={confirmTarget?.kind === 'accept' ? 'Accept' : confirmTarget?.kind === 'reject' ? 'Reject' : 'Remove'}
        danger={confirmTarget?.kind !== 'accept'}
      />
    </div>
  );
}

function Avatar({ name, url }: { name: string | null; url: string | null }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        academyInitials(name)
      )}
    </div>
  );
}
