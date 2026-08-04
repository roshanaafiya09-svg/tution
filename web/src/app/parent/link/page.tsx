'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { ParentLink } from '@/lib/types';
import { Card, PageHeader, Button, Field, inputClass } from '@/components/ui';

const POLICY_VERSION = '1.0';

export default function LinkChildPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [link, setLink] = useState<ParentLink | null>(null);
  const [consenting, setConsenting] = useState(false);
  const [done, setDone] = useState(false);

  async function redeem() {
    setError(null);
    setRedeeming(true);
    try {
      const result = await api.post<ParentLink>('/parent-links/redeem', { token });
      setLink(result);
      if (result.status === 'active') setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not find that invite. Check the token and try again.',
      );
    } finally {
      setRedeeming(false);
    }
  }

  async function consent() {
    if (!link) return;
    setError(null);
    setConsenting(true);
    try {
      await api.post(`/parent-links/${link.id}/consent`, { policyVersion: POLICY_VERSION });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your consent.');
    } finally {
      setConsenting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        title="Link a child"
        description="Your child shares an invite token from their app — paste it below."
      />

      <Card>
        {done ? (
          <div className="text-center">
            <p className="font-display text-xl font-semibold text-neutral-900">Linked</p>
            <p className="mt-2 text-sm text-neutral-500">
              You&apos;ll now see this child&apos;s attendance, progress, and weekly digest.
            </p>
            <Button className="mt-6 w-full" onClick={() => router.push('/parent')}>
              Go to my children
            </Button>
          </div>
        ) : link ? (
          <div>
            <p className="text-sm text-neutral-700">
              Under India&apos;s DPDP Act, we need your explicit consent before showing you this
              child&apos;s attendance, materials, and progress data.
            </p>
            {error && <p className="mt-3 text-sm text-error">{error}</p>}
            <Button className="mt-4 w-full" onClick={() => void consent()} disabled={consenting}>
              {consenting ? 'Saving…' : 'I consent — link my child'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Field label="Invite token" hint="Ask your child to share it from their app's settings.">
              <input
                className={inputClass}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste the token here"
              />
            </Field>
            {error && <p className="text-sm text-error">{error}</p>}
            <Button onClick={() => void redeem()} disabled={redeeming || !token}>
              {redeeming ? 'Checking…' : 'Continue'}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
