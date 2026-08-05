'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { PartyPopper, AlertTriangle } from 'lucide-react';
import { api, tokenStore, ApiError } from '@/lib/api';
import { Card, Button, InlineError, PageLoading } from '@/components/ui';

interface InvitePreview {
  batchTitle: string;
  expiresAt: string;
  isExhausted: boolean;
  isExpired: boolean;
}

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    api
      .get<InvitePreview>(`/invites/${token}`)
      .then(setPreview)
      .catch(() => setError('This invite link is not valid.'));
  }, [token]);

  async function join() {
    if (!tokenStore.access) {
      // Come back here after signing in.
      router.push(`/login?next=/join/${token}`);
      return;
    }

    setError(null);
    setJoining(true);
    try {
      await api.post(`/invites/${token}/redeem`);
      setJoined(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not join this batch. Try again.',
      );
    } finally {
      setJoining(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Link
            href="/"
            className="font-display text-2xl font-semibold italic text-brand-800 dark:text-brand-200"
          >
            Scholar
          </Link>
        </div>

        <Card>
          {error && !preview ? (
            <InlineError>{error}</InlineError>
          ) : !preview ? (
            <PageLoading label="Loading…" />
          ) : joined ? (
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success-bg dark:bg-success/15">
                <PartyPopper className="h-6 w-6 text-success dark:text-success-dark" aria-hidden />
              </div>
              <p className="font-display text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
                You&apos;re in
              </p>
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                You&apos;ve joined {preview.batchTitle}. Your classes and homework will show up in
                the app.
              </p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                You&apos;ve been invited to join
              </p>
              <p className="mt-2 font-display text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
                {preview.batchTitle}
              </p>

              {preview.isExpired || preview.isExhausted ? (
                <p className="mt-4 flex items-center justify-center gap-1.5 text-sm text-warning dark:text-warning-dark">
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                  This invite link is no longer active. Ask your tutor for a new one.
                </p>
              ) : (
                <>
                  {error && (
                    <div className="mt-4">
                      <InlineError>{error}</InlineError>
                    </div>
                  )}
                  <div className="mt-6">
                    <Button onClick={() => void join()} disabled={joining} loading={joining} className="w-full">
                      {joining ? 'Joining…' : 'Join this batch'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
