'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ChevronRight,
  CreditCard,
  Globe,
  School,
  ShieldCheck,
  UserCircle,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { Me, SubscriptionRecap, TutorAcademyAffiliation, TutorProfile } from '@/lib/types';
import { Badge, CardSkeleton, ErrorState } from '@/components/ui';
import { TeacherPageHeader, AcademicCard } from '@/components/dashboard';

function SettingRow({
  icon: Icon,
  title,
  description,
  href,
  status,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  status?: { label: string; variant: 'neutral' | 'brand' | 'success' | 'warning' };
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-neutral-50 sm:px-5 dark:hover:bg-neutral-800/50"
    >
      <Icon className="h-[18px] w-[18px] shrink-0 text-neutral-400 dark:text-neutral-500" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{title}</p>
        <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
      </div>
      {status && (
        <Badge variant={status.variant} className="shrink-0 capitalize">
          {status.label}
        </Badge>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300 dark:text-neutral-600" aria-hidden />
    </Link>
  );
}

export default function SettingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [profile, setProfile] = useState<TutorProfile | null>(null);
  const [recap, setRecap] = useState<SubscriptionRecap | null>(null);
  const [academies, setAcademies] = useState<TutorAcademyAffiliation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    setLoaded(false);
    Promise.all([
      api.get<Me>('/auth/me'),
      api.get<TutorProfile | null>('/profiles/tutor/me').catch(() => null),
      api.get<SubscriptionRecap | null>('/subscriptions/recap').catch(() => null),
      api.get<TutorAcademyAffiliation[]>('/marketplace/academies/me/memberships').catch(() => []),
    ])
      .then(([meRow, profileRow, recapRow, academyRows]) => {
        setMe(meRow);
        setProfile(profileRow);
        setRecap(recapRow);
        setAcademies(academyRows);
        setLoaded(true);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const verification = profile?.verification_status ?? null;

  return (
    <div className="space-y-5">
      <TeacherPageHeader
        eyebrow="Account"
        title="Settings"
        description="Your subscription, trust status, and how you're listed — each one opens the page that owns it."
      />

      {loadError ? (
        <ErrorState description="Could not load your settings. Check your connection and try again." onRetry={load} />
      ) : !loaded ? (
        <div className="space-y-4">
          <CardSkeleton className="h-24 rounded-2xl" />
          <CardSkeleton className="h-64 rounded-2xl" />
        </div>
      ) : (
        <>
          <AcademicCard className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-500">
                Signed in as
              </p>
              <p className="mt-1 font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                {profile?.display_name ?? me?.phoneE164}
              </p>
              <p className="mt-0.5 truncate text-sm text-neutral-500 dark:text-neutral-400">
                {me?.phoneE164}
                {me?.email ? ` · ${me.email}` : ''}
              </p>
            </div>
            <Link
              href="/dashboard/profile"
              className="text-sm font-medium text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
            >
              Manage account →
            </Link>
          </AcademicCard>

          <AcademicCard className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
            <SettingRow
              icon={CreditCard}
              title="Subscription & billing"
              description="Your plan, trial status, and payout history."
              href="/dashboard/billing"
              status={
                recap
                  ? {
                      label: recap.subscriptionStatus.replace('_', ' '),
                      variant: recap.subscriptionStatus === 'active' ? 'success' : recap.subscriptionStatus === 'past_due' ? 'warning' : 'brand',
                    }
                  : undefined
              }
            />
            <SettingRow
              icon={ShieldCheck}
              title="Verification"
              description="ID and qualification documents for your verified badge."
              href="/dashboard/verification"
              status={
                verification
                  ? {
                      label: verification,
                      variant: verification === 'verified' ? 'success' : verification === 'rejected' ? 'warning' : 'neutral',
                    }
                  : undefined
              }
            />
            <SettingRow
              icon={Globe}
              title="Marketplace listing"
              description="Location, public profile preview, and Proof-of-Teaching score."
              href="/dashboard/marketplace"
            />
            <SettingRow
              icon={School}
              title="Teaching arrangement"
              description={
                academies.length > 0
                  ? `Teaching under ${academies.map((a) => a.name).join(', ')}.`
                  : 'You teach independently. Connect to an academy any time.'
              }
              href="/dashboard/teacher-profile"
              status={
                academies.length > 0
                  ? { label: 'Academy member', variant: 'brand' }
                  : { label: 'Independent', variant: 'neutral' }
              }
            />
            <SettingRow
              icon={UserCircle}
              title="Account & data"
              description="Personal details, data export, and account deletion."
              href="/dashboard/profile"
            />
          </AcademicCard>

          <p className="text-xs text-neutral-400 dark:text-neutral-500">
            Scholar follows your device&apos;s light or dark appearance — there&apos;s no separate theme setting to
            keep in sync.
          </p>
        </>
      )}
    </div>
  );
}
