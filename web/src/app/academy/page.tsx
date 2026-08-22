'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Award,
  Building2,
  CalendarClock,
  CalendarDays,
  GraduationCap,
  Images,
  MessageCircle,
  ShieldCheck,
  Star,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type {
  AcademyActiveTeacher,
  AcademyKycVerificationStatus,
  AcademyManagedBatch,
  AcademyOwnerProfile,
  AcademyOwnerStats,
  AcademyPendingRequest,
  AcademyPhoto,
  AcademyTodaySession,
  ContactRequest,
  Review,
  Subject,
} from '@/lib/types';
import { buttonVariants, CardSkeleton, ErrorState, StatCard, StatusBadge } from '@/components/ui';
import { AcademyCard, AcademyHero, AcademySectionHeader, type DayPeriod } from '@/components/academy';
import { SectionHeader, ActionCard, ActivityFeed, EmptyPanel, type ActivityItem } from '@/components/dashboard';
import { academyInitials } from '@/lib/academies';
import { useAcademyDashboard } from '@/components/academy-shell';

const GREETING: Record<DayPeriod, string> = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
};

function dayPeriod(): DayPeriod {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function isToday(session: AcademyTodaySession): boolean {
  return new Date(session.scheduledStartUtc).toDateString() === new Date().toDateString();
}

function sessionTime(session: AcademyTodaySession): string {
  return new Date(session.scheduledStartUtc).toLocaleTimeString('en-IN', {
    timeZone: session.timezone,
    hour: 'numeric',
    minute: '2-digit',
  });
}

function sessionDateTime(session: AcademyTodaySession): string {
  return new Date(session.scheduledStartUtc).toLocaleString('en-IN', {
    timeZone: session.timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AcademyTodayPage() {
  const { hasAcademy } = useAcademyDashboard();
  const [profile, setProfile] = useState<AcademyOwnerProfile | null>(null);
  const [stats, setStats] = useState<AcademyOwnerStats | null>(null);
  const [pendingRequests, setPendingRequests] = useState<AcademyPendingRequest[]>([]);
  const [contactRequests, setContactRequests] = useState<ContactRequest[]>([]);
  const [activeTeachers, setActiveTeachers] = useState<AcademyActiveTeacher[]>([]);
  const [sessions, setSessions] = useState<AcademyTodaySession[]>([]);
  const [batches, setBatches] = useState<AcademyManagedBatch[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [photos, setPhotos] = useState<AcademyPhoto[]>([]);
  const [kyc, setKyc] = useState<AcademyKycVerificationStatus | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (hasAcademy === false) return;
    setLoadError(false);
    try {
      const profileRes = await api.get<AcademyOwnerProfile>('/academy/me');
      setProfile(profileRes);
      const [
        statsRes,
        pendingRes,
        contactRes,
        teachersRes,
        sessionsRes,
        batchesRes,
        subjectsRes,
        photosRes,
        kycRes,
        reviewsRes,
      ] = await Promise.all([
        api.get<AcademyOwnerStats>('/academy/me/stats'),
        api.get<AcademyPendingRequest[]>('/academy/me/teachers/pending'),
        api.get<ContactRequest[]>('/academy/me/contact-requests'),
        api.get<AcademyActiveTeacher[]>('/academy/me/teachers/active'),
        api.get<AcademyTodaySession[]>('/academy/me/sessions'),
        api.get<AcademyManagedBatch[]>('/academy/me/batches').catch(() => [] as AcademyManagedBatch[]),
        api.get<Subject[]>('/catalog/subjects').catch(() => [] as Subject[]),
        api.get<AcademyPhoto[]>('/academy/me/photos').catch(() => [] as AcademyPhoto[]),
        api.get<AcademyKycVerificationStatus>('/academy/verification/me').catch(() => null),
        api
          .get<{ reviews: Review[] }>(`/marketplace/academy-reviews/academy/${profileRes.id}`)
          .then((r) => r.reviews)
          .catch(() => [] as Review[]),
      ]);
      setStats(statsRes);
      setPendingRequests(pendingRes);
      setContactRequests(contactRes);
      setActiveTeachers(teachersRes);
      setSessions(sessionsRes);
      setBatches(batchesRes);
      setSubjects(subjectsRes);
      setPhotos(photosRes);
      setKyc(kycRes);
      setReviews(reviewsRes);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) {
        setLoadError(true);
      }
    }
  }, [hasAcademy]);

  useEffect(() => {
    void load();
  }, [load]);

  if (hasAcademy === false) {
    return <WelcomeCard period={dayPeriod()} />;
  }

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

  const period = dayPeriod();
  const todaySessions = sessions.filter(isToday);
  const upcoming = sessions
    .filter((s) => !isToday(s) && s.status === 'scheduled')
    .sort((a, b) => new Date(a.scheduledStartUtc).getTime() - new Date(b.scheduledStartUtc).getTime());

  const enrolledByBatch = new Map(batches.map((b) => [b.id, b.enrolledCount]));
  const studentsTodayBatchIds = new Set(todaySessions.map((s) => s.batchId));
  const studentsToday = Array.from(studentsTodayBatchIds).reduce((sum, id) => sum + (enrolledByBatch.get(id) ?? 0), 0);

  function subjectName(subjectId: string): string | undefined {
    return subjects.find((s) => s.id === subjectId)?.name_i18n.en;
  }

  const actionItems: { key: string; href: string; icon: LucideIcon; label: string; meta: string; tone: 'error' | 'warning' | 'info' | 'brand' }[] = [];
  if (!profile.description || !profile.location) {
    actionItems.push({
      key: 'profile',
      href: '/academy/profile',
      icon: Building2,
      label: 'Complete your academy profile',
      meta: 'Families see this on Find an Academy',
      tone: 'brand',
    });
  }
  if (!kyc || kyc.status === 'not_started' || kyc.status === 'rejected' || kyc.status === 'needs_manual_review') {
    actionItems.push({
      key: 'kyc',
      href: '/academy/verification',
      icon: ShieldCheck,
      label: kyc && kyc.status !== 'not_started' ? 'Verification needs your attention' : 'Complete KYC verification',
      meta: 'Unlocks the verified badge and public search',
      tone: 'brand',
    });
  }
  if (photos.length === 0) {
    actionItems.push({
      key: 'photos',
      href: '/academy/photos',
      icon: Images,
      label: 'Add academy photos',
      meta: 'A gallery helps families choose your academy',
      tone: 'info',
    });
  }
  if (stats.unreadContactRequestCount > 0) {
    actionItems.push({
      key: 'contact',
      href: '/academy/contact-requests',
      icon: MessageCircle,
      label: `${stats.unreadContactRequestCount} unread contact ${stats.unreadContactRequestCount === 1 ? 'request' : 'requests'}`,
      meta: 'Respond before they look elsewhere',
      tone: 'warning',
    });
  }
  if (pendingRequests.length > 0) {
    actionItems.push({
      key: 'teachers',
      href: '/academy/teachers',
      icon: UserCheck,
      label: `${pendingRequests.length} pending teacher ${pendingRequests.length === 1 ? 'request' : 'requests'}`,
      meta: 'Review who wants to join your academy',
      tone: 'info',
    });
  }

  const activity: ActivityItem[] = [
    ...activeTeachers.map((t) => ({
      id: `teacher-${t.membershipId}`,
      icon: UserCheck,
      tone: 'success' as const,
      title: `${t.displayName ?? 'A teacher'} joined your academy`,
      timestamp: t.joinedAt,
      href: '/academy/teachers',
    })),
    ...contactRequests.map((r) => ({
      id: `contact-${r.id}`,
      icon: MessageCircle,
      tone: 'info' as const,
      title: `New contact request from ${r.student_display_name ?? 'a visitor'}`,
      timestamp: r.created_at,
      href: '/academy/contact-requests',
      unread: !r.read_at,
    })),
    ...reviews.map((r) => ({
      id: `review-${r.id}`,
      icon: Star,
      tone: 'brand' as const,
      title: `New review from ${r.student_display_name ?? 'a student'} — ${r.rating}★`,
      timestamp: r.created_at,
      href: '/academy/reviews',
    })),
    ...batches.map((b) => ({
      id: `batch-${b.id}`,
      icon: CalendarClock,
      tone: 'brand' as const,
      title: `Batch created: ${b.title}`,
      detail: b.tutorDisplayName ?? undefined,
      timestamp: b.createdAt,
      href: `/academy/batches/${b.id}`,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="space-y-8">
      <div className="animate-fade-up" style={{ animationDelay: '0ms' }}>
        <AcademyHero
          period={period}
          greeting={`${GREETING[period]}, ${profile.name} 👋`}
          subtitle="Here's what's happening at your academy today."
        />
      </div>

      <section className="animate-fade-up" style={{ animationDelay: '60ms' }}>
        <SectionHeader eyebrow="Overview" title="Today's summary" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={CalendarDays} label="Classes today" value={todaySessions.length} />
          <StatCard icon={Users} label="Active teachers" value={stats.teacherCount} />
          <StatCard icon={GraduationCap} label="Students attending today" value={studentsToday} />
          <StatCard icon={MessageCircle} label="Pending contact requests" value={stats.unreadContactRequestCount} />
        </div>
      </section>

      <section className="animate-fade-up" style={{ animationDelay: '100ms' }}>
        <SectionHeader eyebrow="Your classroom" title="Upcoming classes" action={{ href: '/academy/batches', label: 'All batches' }} />
        {sessions.length === 0 ? (
          <EmptyPanel
            icon={CalendarDays}
            title="No classes scheduled"
            description="Once your teachers' batches have sessions scheduled, they'll show up here."
          />
        ) : (
          <AcademyCard className="p-0">
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {[...todaySessions, ...upcoming].slice(0, 8).map((session) => (
                <li key={session.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
                  <span className="w-16 shrink-0 font-display text-base font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
                    {isToday(session) ? sessionTime(session) : sessionDateTime(session).split(',')[0]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      {session.batchTitle}
                    </span>
                    <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {subjectName(session.subjectId) ? `${subjectName(session.subjectId)} · ` : ''}
                      {session.tutorDisplayName ?? 'Teacher'} · {session.durationMin} min
                    </span>
                  </span>
                  <StatusBadge status={session.status} />
                  <Link
                    href={`/academy/batches/${session.batchId}`}
                    className="shrink-0 text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
                  >
                    View
                  </Link>
                </li>
              ))}
            </ul>
          </AcademyCard>
        )}
      </section>

      <section className="animate-fade-up" style={{ animationDelay: '140ms' }}>
        <SectionHeader eyebrow="What needs me" title="Action required" />
        {actionItems.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">You&apos;re all caught up — nothing needs you right now.</p>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {actionItems.map((item) => (
              <ActionCard key={item.key} href={item.href} icon={item.icon} label={item.label} meta={item.meta} tone={item.tone} />
            ))}
          </div>
        )}
      </section>

      <section className="animate-fade-up" style={{ animationDelay: '180ms' }}>
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
                  <Link href="/academy/teachers" className="mt-1.5 inline-block text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">
                    Review request
                  </Link>
                </div>
              </AcademyCard>
            ))}
          </div>
        )}
      </section>

      <section className="animate-fade-up" style={{ animationDelay: '220ms' }}>
        <SectionHeader eyebrow="What's been happening" title="Recent activity" />
        {activity.length === 0 ? (
          <p className="text-sm text-neutral-400 dark:text-neutral-500">Nothing yet — activity shows up here as your academy grows.</p>
        ) : (
          <ActivityFeed items={activity.slice(0, 6)} />
        )}
      </section>

      <section className="animate-fade-up" style={{ animationDelay: '260ms' }}>
        <AcademySectionHeader title="Recent Reviews" action={{ href: '/academy/reviews', label: 'View all' }} />
        <AcademyCard className="flex items-center gap-3">
          <Award className="h-5 w-5 text-brand-500 dark:text-brand-300" aria-hidden />
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {stats.rating.count === 0
              ? 'No reviews yet.'
              : `${stats.rating.count} review${stats.rating.count === 1 ? '' : 's'} · ${stats.rating.average} ★ average.`}
          </p>
        </AcademyCard>
      </section>
    </div>
  );
}

/** Shown when the account has no `academies` row yet. Uses the same
 *  hero-first, section-based rhythm as the loaded Today page (rather than a
 *  standalone landing screen) so it reads as "Today, before your academy
 *  exists" — with a link to Academy Profile, never the creation form itself
 *  (that lives only on Academy Profile, per the Navigation, Routing & UX
 *  Update spec). */
function WelcomeCard({ period }: { period: DayPeriod }) {
  return (
    <div className="space-y-8">
      <AcademyHero period={period} greeting={`${GREETING[period]} 👋`} subtitle="Let's get your academy set up on Scholar." />

      <section>
        <SectionHeader eyebrow="Academy Dashboard" title="Get started" />
        <AcademyCard className="max-w-md">
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">Academy profile incomplete</p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Complete your profile to unlock all Academy features — teachers, contact requests, batches, and more. It
            only takes a name to get started; you can add a description, subjects, location, and photos afterward.
          </p>
          <Link href="/academy/profile" className={buttonVariants({ className: 'mt-4' })}>
            Complete Academy Profile
          </Link>
        </AcademyCard>
      </section>
    </div>
  );
}
