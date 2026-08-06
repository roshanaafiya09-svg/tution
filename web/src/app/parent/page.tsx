'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { api } from '@/lib/api';
import type { Digest, ParentLink } from '@/lib/types';
import { Card, PageHeader, EmptyState, StatusBadge, Button, PageLoading } from '@/components/ui';

export default function ParentHomePage() {
  const [links, setLinks] = useState<ParentLink[] | null>(null);
  const [digests, setDigests] = useState<Digest[]>([]);
  const [consentingId, setConsentingId] = useState<string | null>(null);

  const load = () => void api.get<ParentLink[]>('/parent-links/me').then(setLinks);

  useEffect(() => {
    load();
    void api.get<Digest[]>('/digests/me').then(setDigests);
  }, []);

  function latestDigestFor(studentId: string): Digest | undefined {
    return digests.find((d) => d.student_id === studentId);
  }

  async function grantConsent(linkId: string) {
    setConsentingId(linkId);
    try {
      await api.post(`/parent-links/${linkId}/consent`, { policyVersion: '1.0' });
      load();
    } finally {
      setConsentingId(null);
    }
  }

  const active = links?.filter((l) => l.status === 'active') ?? [];
  const pending = links?.filter((l) => l.status === 'pending') ?? [];

  return (
    <div>
      <PageHeader
        title="Your children"
        description="Attendance, progress, and weekly digests for each linked child."
        action={
          <Link href="/parent/link">
            <Button>Link a child</Button>
          </Link>
        }
      />

      {links === null ? (
        <PageLoading />
      ) : active.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No children linked yet"
          description="Ask your child to share their invite token from the mobile app, then link them here."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {active.map((link) => {
            const digest = latestDigestFor(link.student_id);
            return (
              <Link key={link.id} href={`/parent/child/${link.student_id}`}>
                <Card interactive className="h-full">
                  <p className="font-medium text-neutral-900 dark:text-neutral-50">
                    {link.student_display_name ?? `Student ${link.student_id.slice(0, 8)}`}
                  </p>
                  {digest ? (
                    <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                      {digest.narrative}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                      No digest yet.
                    </p>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {pending.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            Awaiting consent
          </h2>
          <Card className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
            {pending.map((link) => (
              <div key={link.id} className="flex items-center justify-between px-6 py-3">
                <p className="text-sm text-neutral-700 dark:text-neutral-300">
                  {link.student_display_name ?? `Student ${link.student_id.slice(0, 8)}`}
                </p>
                <div className="flex items-center gap-3">
                  <StatusBadge status="pending" />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void grantConsent(link.id)}
                    disabled={consentingId === link.id}
                    loading={consentingId === link.id}
                  >
                    {consentingId === link.id ? 'Saving…' : 'Grant consent'}
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
