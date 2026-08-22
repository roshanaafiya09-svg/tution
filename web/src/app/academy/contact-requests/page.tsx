'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { api } from '@/lib/api';
import type { ContactRequest } from '@/lib/types';
import { Badge, CardSkeleton, EmptyState, ErrorState } from '@/components/ui';
import { AcademyCard, AcademyPageIntro, AcademySetupBanner } from '@/components/academy';
import { useAcademyDashboard } from '@/components/academy-shell';

export default function AcademyContactRequestsPage() {
  const { hasAcademy } = useAcademyDashboard();
  const [requests, setRequests] = useState<ContactRequest[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (hasAcademy === false) {
      setRequests([]);
      return;
    }
    setLoadError(false);
    try {
      setRequests(await api.get<ContactRequest[]>('/academy/me/contact-requests'));
    } catch {
      setLoadError(true);
    }
  }, [hasAcademy]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(id: string) {
    await api.post(`/academy/me/contact-requests/${id}/read`);
    setRequests((prev) => prev?.map((r) => (r.id === id ? { ...r, read_at: new Date().toISOString() } : r)) ?? null);
  }

  return (
    <div>
      <AcademySetupBanner />
      <AcademyPageIntro
        eyebrow="Academy Dashboard"
        title="Contact Requests"
        description="Messages from students and parents interested in your academy."
      />

      <div className="mt-8">
        {loadError ? (
          <ErrorState description="Could not load contact requests. Check your connection and try again." onRetry={() => void load()} />
        ) : requests === null ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : requests.length === 0 ? (
          <EmptyState icon={MessageCircle} title="No contact requests yet" description="Leads from Find an Academy will appear here." />
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <AcademyCard key={r.id} className="flex items-start gap-3">
                <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-500 dark:text-brand-300" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      {r.student_display_name ?? 'A visitor'}
                    </p>
                    <span className="text-xs capitalize text-neutral-400 dark:text-neutral-500">{r.requester_role}</span>
                    {!r.read_at && <Badge variant="brand">New</Badge>}
                  </div>
                  {r.message && <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{r.message}</p>}
                  <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                    {r.email ?? r.phone_e164} · {new Date(r.created_at).toLocaleDateString()}
                  </p>
                  {!r.read_at && (
                    <button
                      type="button"
                      onClick={() => void markRead(r.id)}
                      className="mt-1.5 text-xs font-medium text-brand-600 hover:underline dark:text-brand-300"
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              </AcademyCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
