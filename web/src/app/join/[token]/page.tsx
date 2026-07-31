'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, tokenStore, ApiError } from '@/lib/api';
import { Card, Button } from '@/components/ui';

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
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Link href="/" className="font-display text-2xl font-semibold italic text-brand-800">
            Scholar
          </Link>
        </div>

        <Card>
          {error && !preview ? (
            <p className="text-center text-sm text-error">{error}</p>
          ) : !preview ? (
            <p className="text-center text-sm text-neutral-400">Loading…</p>
          ) : joined ? (
            <div className="text-center">
              <p className="font-display text-2xl font-semibold text-neutral-900">You&apos;re in</p>
              <p className="mt-2 text-sm text-neutral-500">
                You&apos;ve joined {preview.batchTitle}. Your classes and homework will show up in
                the app.
              </p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-sm text-neutral-500">You&apos;ve been invited to join</p>
              <p className="mt-2 font-display text-2xl font-semibold text-neutral-900">
                {preview.batchTitle}
              </p>

              {preview.isExpired || preview.isExhausted ? (
                <p className="mt-4 text-sm text-warning">
                  This invite link is no longer active. Ask your tutor for a new one.
                </p>
              ) : (
                <>
                  {error && <p className="mt-4 text-sm text-error">{error}</p>}
                  <div className="mt-6">
                    <Button onClick={() => void join()} disabled={joining} className="w-full">
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
