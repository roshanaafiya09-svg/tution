'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Award, GraduationCap, MessageCircle, Star, Users, CalendarClock } from 'lucide-react';
import { api } from '@/lib/api';
import type {
  AcademyOwnerProfile,
  AcademyOwnerStats,
  AcademyPendingRequest,
  ContactRequest,
} from '@/lib/types';
import { Badge, CardSkeleton, ErrorState, StatCard, StatusBadge } from '@/components/ui';
import { AcademyCard, AcademyPageIntro, AcademySectionHeader } from '@/components/academy';
import { academyInitials } from '@/lib/academies';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function AcademyOverviewPage() {
  const [profile, setProfile] = useState<AcademyOwnerProfile | null>(null);
  const [stats, setStats] = useState<AcademyOwnerStats | null>(null);
  const [pendingRequests, setPendingRequests] = useState<AcademyPendingRequest[]>([]);
  const [contactRequests, setContactRequests] = useState<ContactRequest[]>([]);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [profileRes, statsRes, pendingRes, contactRes] = await Promise.all([
        api.get<AcademyOwnerProfile>('/academy/me'),
        api.get<AcademyOwnerStats>('/academy/me/stats'),
        api.get<AcademyPendingRequest[]>('/academy/me/teachers/pending'),
        api.get<ContactRequest[]>('/academy/me/contact-requests'),
      ]);
      setProfile(profileRes);
      setStats(statsRes);
      setPendingRequests(pendingRes);
      setContactRequests(contactRes);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadError) {
    return (
      <ErrorState
        description="Could not load your academy dashboard. Check your connection and try again."
        onRetry={() => void load()}
      />
    );
  }

  if (!profile || !stats) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div>
      <AcademyPageIntro
        eyebrow="Academy Dashboard"
        title={`${greeting()}, ${profile.name}`}
        description="Here's what's happening at your academy today."
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Teachers" value={stats.teacherCount} />
        <StatCard icon={GraduationCap} label="Students" value={stats.studentsCount} />
        <StatCard icon={CalendarClock} label="Active Batches" value={stats.openBatchesCount} />
        <StatCard
          icon={Star}
          label="Rating"
          value={stats.rating.average !== null ? `${stats.rating.average} ★` : '—'}
          iconClassName="fill-accent-400 text-accent-400"
        />
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        <StatusBadge status={profile.verificationStatus} />
        {stats.pendingRequestCount > 0 && (
          <span className="text-sm text-neutral-500 dark:text-neutral-400">
            {stats.pendingRequestCount} pending teacher {stats.pendingRequestCount === 1 ? 'request' : 'requests'}
          </span>
        )}
        {stats.unreadContactRequestCount > 0 && (
          <span className="text-sm text-neutral-500 dark:text-neutral-400">
            · {stats.unreadContactRequestCount} unread contact {stats.unreadContactRequestCount === 1 ? 'request' : 'requests'}
          </span>
        )}
      </div>

      <div className="mt-8">
        <AcademySectionHeader title="Pending Teacher Requests" action={{ href: '/academy/teachers', label: 'View all' }} />
        {pendingRequests.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">No pending requests right now.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {pendingRequests.slice(0, 4).map((r) => (
              <AcademyCard key={r.requestId} className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                  {r.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    academyInitials(r.displayName)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{r.displayName ?? 'Teacher'}</p>
                  {r.headline && <p className="text-xs text-neutral-500 dark:text-neutral-400">{r.headline}</p>}
                  <Link
                    href="/academy/teachers"
                    className="mt-1.5 inline-block text-xs font-medium text-brand-600 hover:underline dark:text-brand-300"
                  >
                    Review request
                  </Link>
                </div>
              </AcademyCard>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <AcademySectionHeader title="Recent Contact Requests" action={{ href: '/academy/contact-requests', label: 'View all' }} />
        {contactRequests.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">No contact requests yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {contactRequests.slice(0, 4).map((r) => (
              <AcademyCard key={r.id} className="flex items-start gap-3">
                <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-500 dark:text-brand-300" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    {r.student_display_name ?? 'A visitor'}
                  </p>
                  {r.message && <p className="text-xs text-neutral-500 dark:text-neutral-400">{r.message}</p>}
                  {!r.read_at && <Badge variant="brand" className="mt-1">New</Badge>}
                </div>
              </AcademyCard>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <AcademySectionHeader title="Recent Reviews" action={{ href: '/academy/reviews', label: 'View all' }} />
        <AcademyCard className="flex items-center gap-3">
          <Award className="h-5 w-5 text-brand-500 dark:text-brand-300" aria-hidden />
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {stats.rating.count === 0
              ? 'No reviews yet.'
              : `${stats.rating.count} review${stats.rating.count === 1 ? '' : 's'} · ${stats.rating.average} ★ average.`}
          </p>
        </AcademyCard>
      </div>
    </div>
  );
}
