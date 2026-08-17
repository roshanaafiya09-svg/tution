'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, FileText, Landmark, AlertTriangle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { AcademyKycVerificationStatus } from '@/lib/types';
import {
  Button,
  CardSkeleton,
  ErrorState,
  InlineError,
  StatusBadge,
} from '@/components/ui';
import { AcademyCard, AcademyPageIntro } from '@/components/academy';

const POLICY_VERSION = '1.0';

const REQUIRED_STEPS = [
  {
    icon: ShieldCheck,
    title: 'Owner identity verification',
    description: "Confirming who you are, using a government-issued ID.",
  },
  {
    icon: FileText,
    title: 'Academy / business proof',
    description: 'Where applicable — confirming your academy is a real, operating business.',
  },
  {
    icon: Landmark,
    title: 'Payment / bank-account verification',
    description: 'If required later, before payouts are enabled for your academy.',
  },
];

function StatusHeadline({ status }: { status: AcademyKycVerificationStatus['status'] }) {
  switch (status) {
    case 'verified':
      return <p className="text-neutral-700 dark:text-neutral-300">Your academy&apos;s identity has been verified.</p>;
    case 'pending':
    case 'under_review':
      return (
        <p className="text-neutral-700 dark:text-neutral-300">
          Your verification is being reviewed. We&apos;ll update this page as soon as it&apos;s done — no action needed from you right now.
        </p>
      );
    case 'rejected':
      return (
        <p className="text-neutral-700 dark:text-neutral-300">
          Your last submission wasn&apos;t approved. Review the reason below, then submit again when you&apos;re ready.
        </p>
      );
    case 'needs_manual_review':
      return (
        <p className="text-neutral-700 dark:text-neutral-300">
          Your submission needs a closer look from our team. See the note below — you can submit again if something needs correcting.
        </p>
      );
    default:
      return null;
  }
}

export default function AcademyVerificationPage() {
  const [status, setStatus] = useState<AcademyKycVerificationStatus | null | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await api.get<AcademyKycVerificationStatus>('/academy/verification/me');
      setStatus(res);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function startVerification() {
    setError(null);
    setStarting(true);
    try {
      await api.post('/academy/verification/start', {
        consent: true,
        policyVersion: POLICY_VERSION,
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start verification. Try again.');
    } finally {
      setStarting(false);
    }
  }

  if (loadError) {
    return (
      <ErrorState
        description="Could not load your verification status. Check your connection and try again."
        onRetry={() => void load()}
      />
    );
  }

  if (status === undefined) {
    return (
      <div className="grid gap-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const canStart =
    status === null || status.status === 'not_started' || status.status === 'rejected' || status.status === 'needs_manual_review';

  return (
    <div>
      <AcademyPageIntro
        eyebrow="Academy Dashboard"
        title="Verification"
        description="Confirming your identity helps keep Scholar safe and prevents fake academies from listing."
      />

      <div className="mt-8 grid gap-4">
        <AcademyCard>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">Status</p>
            <StatusBadge status={status?.status ?? 'not_started'} />
          </div>
          <div className="mt-3">
            <StatusHeadline status={status?.status ?? 'not_started'} />
          </div>
          {status?.reason && (status.status === 'rejected' || status.status === 'needs_manual_review') && (
            <div className="mt-4 flex gap-2 rounded-lg border border-warning/30 bg-warning-bg p-3 text-sm text-neutral-700 dark:border-warning-dark/30 dark:bg-warning/10 dark:text-neutral-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
              <p>{status.reason}</p>
            </div>
          )}
        </AcademyCard>

        {(!status || status.status === 'not_started') && (
          <AcademyCard>
            <p className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">What we check</p>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              To help keep Scholar safe and prevent fake academies, we verify the identity of the academy owner or authorized
              representative. We only ask for what&apos;s needed to confirm that.
            </p>
            <ul className="mt-4 space-y-3">
              {REQUIRED_STEPS.map((step) => (
                <li key={step.title} className="flex gap-3">
                  <step.icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{step.title}</p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">{step.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </AcademyCard>
        )}

        {canStart && (
          <AcademyCard>
            <p className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">Consent</p>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              Your identity information and verification documents may be securely processed by our identity-verification
              partner for the purpose of verifying your identity. Please review Scholar&apos;s Privacy Policy and the
              partner&apos;s applicable terms before continuing.
            </p>
            {error && (
              <div className="mt-3">
                <InlineError>{error}</InlineError>
              </div>
            )}
            <Button className="mt-4" onClick={() => void startVerification()} disabled={starting} loading={starting}>
              {starting ? 'Starting…' : status?.status === 'not_started' || !status ? 'Agree & Continue' : 'Agree & Resubmit'}
            </Button>
          </AcademyCard>
        )}
      </div>
    </div>
  );
}
