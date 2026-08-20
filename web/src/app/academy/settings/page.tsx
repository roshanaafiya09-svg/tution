'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, CircleUser, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import type { AcademyOwnerProfile } from '@/lib/types';
import { CardSkeleton, ErrorState, StatusBadge } from '@/components/ui';
import { AcademyCard, AcademyPageIntro, AcademySectionHeader, AcademySetupRequired } from '@/components/academy';
import { useAcademyDashboard } from '@/components/academy-shell';

const VERIFICATION_COPY: Record<string, string> = {
  verified: 'Your academy is verified and appears in Find an Academy search results.',
  pending: 'Your academy is awaiting verification by our team before it appears in public search.',
  rejected: 'Your academy verification was not approved. Contact support for details.',
};

export default function AcademySettingsPage() {
  const { hasAcademy } = useAcademyDashboard();
  const [profile, setProfile] = useState<AcademyOwnerProfile | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (hasAcademy === false) return;
    setLoadError(false);
    try {
      setProfile(await api.get<AcademyOwnerProfile>('/academy/me'));
    } catch {
      setLoadError(true);
    }
  }, [hasAcademy]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <AcademyPageIntro eyebrow="Academy Dashboard" title="Settings" description="Verification, profile, and account shortcuts." />

      <div className="mt-8">
        {hasAcademy === false ? (
          <AcademySetupRequired pageLabel="Settings" />
        ) : loadError ? (
          <ErrorState description="Could not load your settings. Check your connection and try again." onRetry={() => void load()} />
        ) : !profile ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <>
            <AcademySectionHeader title="Verification" />
            <AcademyCard className="mb-8 flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-500 dark:text-brand-300" aria-hidden />
              <div>
                <StatusBadge status={profile.verificationStatus} />
                <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                  {VERIFICATION_COPY[profile.verificationStatus]}
                </p>
                <Link
                  href="/academy/verification"
                  className="mt-2 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
                >
                  Manage verification
                </Link>
              </div>
            </AcademyCard>

            <AcademySectionHeader title="Shortcuts" className="mt-8" />
            <AcademyCard className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
              <Link
                href="/academy/profile"
                className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <Building2 className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">Academy Profile</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Manage what appears on your public profile — description, subjects, location, photos.
                  </p>
                </div>
              </Link>
              <Link
                href="/academy/account"
                className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <CircleUser className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">Account</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Login details, data export, and account deletion.
                  </p>
                </div>
              </Link>
            </AcademyCard>
          </>
        )}
      </div>
    </div>
  );
}
