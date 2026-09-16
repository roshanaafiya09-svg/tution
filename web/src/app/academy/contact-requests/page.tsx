'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, MessageCircle } from 'lucide-react';
import { api } from '@/lib/api';
import type { ContactRequest, ContactRequestStatus } from '@/lib/types';
import { Badge, CardSkeleton, EmptyState, ErrorState, Select } from '@/components/ui';
import { AcademyCard, AcademyPageIntro, AcademySetupBanner } from '@/components/academy';
import { cn } from '@/lib/cn';
import { useAcademyDashboard } from '@/components/academy-shell';

const STATUS_OPTIONS: { value: ContactRequestStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'interested', label: 'Interested' },
  { value: 'joined', label: 'Joined' },
  { value: 'not_interested', label: 'Not Interested' },
];

export default function AcademyContactRequestsPage() {
  const { hasAcademy } = useAcademyDashboard();
  const [requests, setRequests] = useState<ContactRequest[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  async function updateStatus(id: string, status: ContactRequestStatus) {
    setRequests((prev) => prev?.map((r) => (r.id === id ? { ...r, status } : r)) ?? null);
    await api.put(`/academy/me/contact-requests/${id}/status`, { status });
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
            {requests.map((r) => {
              const expanded = expandedId === r.id;
              return (
                <AcademyCard key={r.id} className="p-0">
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedId(expanded ? null : r.id);
                      if (!r.read_at) void markRead(r.id);
                    }}
                    className="flex w-full items-start gap-3 p-6 text-left"
                  >
                    <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-500 dark:text-brand-300" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                          {r.student_display_name ?? 'A visitor'}
                        </p>
                        <span className="text-xs capitalize text-neutral-400 dark:text-neutral-500">{r.requester_role}</span>
                        {!r.read_at && <Badge variant="brand">New</Badge>}
                      </div>
                      {r.message && !expanded && (
                        <p className="mt-1 truncate text-sm text-neutral-600 dark:text-neutral-400">{r.message}</p>
                      )}
                      <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                        {r.email ?? r.phone_e164} · {new Date(r.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <ChevronDown
                      className={cn('mt-1 h-4 w-4 shrink-0 text-neutral-400 transition-transform', expanded && 'rotate-180')}
                      aria-hidden
                    />
                  </button>

                  {expanded && (
                    <div className="space-y-3 border-t border-neutral-100 px-6 py-4 dark:border-neutral-800">
                      {r.message && <p className="text-sm text-neutral-700 dark:text-neutral-300">{r.message}</p>}
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
                        <dt className="font-medium">Requester type</dt>
                        <dd className="capitalize">{r.requester_role}</dd>
                        {r.student_display_name && (
                          <>
                            <dt className="font-medium">Student</dt>
                            <dd>{r.student_display_name}</dd>
                          </>
                        )}
                        <dt className="font-medium">Contact</dt>
                        <dd>{r.email ?? r.phone_e164}</dd>
                        <dt className="font-medium">Received</dt>
                        <dd>{new Date(r.created_at).toLocaleString()}</dd>
                      </dl>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Status</span>
                        <Select
                          value={r.status}
                          onChange={(e) => void updateStatus(r.id, e.target.value as ContactRequestStatus)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-8 w-44 text-xs"
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>
                  )}
                </AcademyCard>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
