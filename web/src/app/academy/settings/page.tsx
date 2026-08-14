'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import type { AcademyOwnerProfile, Me } from '@/lib/types';
import { CardSkeleton, ErrorState, StatusBadge } from '@/components/ui';
import { AcademyCard, AcademyPageIntro, AcademySectionHeader } from '@/components/academy';

const VERIFICATION_COPY: Record<string, string> = {
  verified: 'Your academy is verified and appears in Find an Academy search results.',
  pending: 'Your academy is awaiting verification by our team before it appears in public search.',
  rejected: 'Your academy verification was not approved. Contact support for details.',
};

export default function AcademySettingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [profile, setProfile] = useState<AcademyOwnerProfile | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [meRes, profileRes] = await Promise.all([
        api.get<Me>('/auth/me'),
        api.get<AcademyOwnerProfile>('/academy/me'),
      ]);
      setMe(meRes);
      setProfile(profileRes);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <AcademyPageIntro eyebrow="Academy Dashboard" title="Settings" description="Account and verification details." />

      <div className="mt-8">
        {loadError ? (
          <ErrorState description="Could not load your settings. Check your connection and try again." onRetry={() => void load()} />
        ) : !me || !profile ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <>
            <AcademySectionHeader title="Account" />
            <AcademyCard className="mb-8">
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div className="flex justify-between">
                  <dt className="text-neutral-500 dark:text-neutral-400">Login email</dt>
                  <dd className="text-neutral-900 dark:text-neutral-100">{me.email ?? '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500 dark:text-neutral-400">Login phone</dt>
                  <dd className="text-neutral-900 dark:text-neutral-100">{me.phoneE164}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-neutral-400 dark:text-neutral-500">
                Academy accounts are created by our team — contact support to change your login details.
              </p>
            </AcademyCard>

            <AcademySectionHeader title="Verification" className="mt-8" />
            <AcademyCard className="mb-8 flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-500 dark:text-brand-300" aria-hidden />
              <div>
                <StatusBadge status={profile.verificationStatus} />
                <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                  {VERIFICATION_COPY[profile.verificationStatus]}
                </p>
              </div>
            </AcademyCard>

            <AcademySectionHeader title="Public profile" className="mt-8" />
            <AcademyCard>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Manage what appears on your public profile from{' '}
                <Link href="/academy/profile" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
                  Academy Profile
                </Link>
                .
              </p>
            </AcademyCard>
          </>
        )}
      </div>
    </div>
  );
}
