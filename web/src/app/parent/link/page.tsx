'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ShieldCheck, UserPlus, ArrowRight } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { ParentLink } from '@/lib/types';
import { PageHeader, Button, Field, Input, InlineError } from '@/components/ui';
import { ParentCard } from '@/components/parent';

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

  const childName = link?.student_display_name ?? (link ? `Student ${link.student_id.slice(0, 8)}` : null);

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        eyebrow="Link your child"
        title="Link a child"
        description="Enter the invite token shared by your child to start following their learning."
      />

      <ParentCard>
        {done ? (
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success-bg dark:bg-success/15">
              <CheckCircle2 className="h-6 w-6 text-success dark:text-success-dark" aria-hidden />
            </div>
            <p className="font-display text-xl font-semibold text-neutral-900 dark:text-neutral-50">
              {childName ? `${childName} is linked` : 'Linked'}
            </p>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              You&apos;ll now see their attendance, progress, and weekly digest.
            </p>
            {link && (
              <Link
                href={`/parent/child/${link.student_id}`}
                className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-md bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 dark:bg-brand-500 dark:text-neutral-950 dark:hover:bg-brand-400"
              >
                View {childName ?? 'their'} learning
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
            <Button variant="secondary" className="mt-2.5 w-full" onClick={() => router.push('/parent')}>
              Go to my children
            </Button>
          </div>
        ) : link ? (
          <div>
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </div>
            <p className="text-center font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              {childName ?? 'This child'} found
            </p>
            <p className="mt-2 text-center text-sm text-neutral-600 dark:text-neutral-300">
              Under India&apos;s DPDP Act, we need your explicit consent before showing you this
              child&apos;s attendance, materials, and progress data.
            </p>
            {error && (
              <div className="mt-3">
                <InlineError>{error}</InlineError>
              </div>
            )}
            <Button className="mt-5 w-full" onClick={() => void consent()} disabled={consenting} loading={consenting}>
              {consenting ? 'Saving…' : 'I consent — link my child'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
              <UserPlus className="h-5 w-5" aria-hidden />
            </div>
            <Field label="Invite token" hint="Ask your child to share it from their app's settings.">
              <Input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste the token here"
                autoFocus
              />
            </Field>
            {error && <InlineError>{error}</InlineError>}
            <Button onClick={() => void redeem()} disabled={redeeming || !token} loading={redeeming}>
              {redeeming ? 'Checking…' : 'Continue'}
            </Button>
          </div>
        )}
      </ParentCard>
    </div>
  );
}
