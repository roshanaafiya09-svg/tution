'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import {
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  CheckCircle2,
  ClipboardCheck,
  Images,
  MessageCircle,
  NotebookPen,
  PartyPopper,
  ShieldCheck,
  Star,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { GREETING, dayPeriod, todayLabel } from '@/lib/greeting';
import { useCachedFetch } from '@/lib/use-cached-fetch';
import { cancellationBadgeLabel, sessionTime } from '@/lib/session-labels';
import type {
  AcademyKycVerificationStatus,
  AcademyOwnerProfile,
  AcademyPendingRequest,
  AcademyPhoto,
  AcademyToday,
  EffectiveHolidays,
} from '@/lib/types';
import { buttonVariants, CardSkeleton, ErrorState, StatCard, StatusBadge } from '@/components/ui';
import { AcademyCard, AcademyHero, type DayPeriod } from '@/components/academy';
import { SectionHeader, ActionCard, ActivityFeed, EmptyPanel, type ActivityItem } from '@/components/dashboard';
import { useAcademyDashboard } from '@/components/academy-shell';

interface AcademyBundle {
  profile: AcademyOwnerProfile;
  pendingRequests: AcademyPendingRequest[];
  photos: AcademyPhoto[];
  kyc: AcademyKycVerificationStatus | null;
  todaysHolidays: EffectiveHolidays;
  today: AcademyToday;
}

export default function AcademyTodayPage() {
  const { hasAcademy } = useAcademyDashboard();

  const fetchBundle = useCallback(async (): Promise<AcademyBundle | null> => {
    if (hasAcademy === false) return null;
    try {
      const profileRes = await api.get<AcademyOwnerProfile>('/academy/me');
      const todayDate = new Date().toISOString().slice(0, 10);
      const [pendingRes, photosRes, kycRes, todaysHolidaysRes, todayRes] = await Promise.all([
        api.get<AcademyPendingRequest[]>('/academy/me/teachers/pending').catch(() => [] as AcademyPendingRequest[]),
        api.get<AcademyPhoto[]>('/academy/me/photos').catch(() => [] as AcademyPhoto[]),
        api.get<AcademyKycVerificationStatus>('/academy/verification/me').catch(() => null),
        api
          .get<EffectiveHolidays>(`/academy/me/holidays?from=${todayDate}&to=${todayDate}`)
          .catch(() => ({ governmentHolidays: [], academyHolidays: [] }) as EffectiveHolidays),
        api.get<AcademyToday>('/academy/me/today'),
      ]);
      return {
        profile: profileRes,
        pendingRequests: pendingRes,
        photos: photosRes,
        kyc: kycRes,
        todaysHolidays: todaysHolidaysRes,
        today: todayRes,
      };
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }, [hasAcademy]);

  const { data: bundle, error: loadError, reload: load } = useCachedFetch('academy-dashboard', fetchBundle);

  const profile = bundle?.profile ?? null;
  const pendingRequests = bundle?.pendingRequests ?? [];
  const photos = bundle?.photos ?? [];
  const kyc = bundle?.kyc ?? null;
  const todaysHolidays = bundle?.todaysHolidays ?? { governmentHolidays: [], academyHolidays: [] };
  const today = bundle?.today ?? null;

  if (hasAcademy === false) {
    return <WelcomeCard period={dayPeriod(new Date())} />;
  }

  if (loadError) {
    return (
      <ErrorState
        description="We couldn't load today's academy activity."
        onRetry={() => void load()}
      />
    );
  }

  if (!profile || !today) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const now = new Date();
  const period = dayPeriod(now);
  const { overview, classes, needsAttention, upcoming, recentActivity } = today;

  const gettingStarted: { key: string; href: string; icon: LucideIcon; label: string; meta: string; tone: 'error' | 'warning' | 'info' | 'brand' }[] = [];
  if (!profile.description || !profile.location) {
    gettingStarted.push({
      key: 'profile',
      href: '/academy/profile',
      icon: Building2,
      label: 'Complete your academy profile',
      meta: 'Families see this on Find an Academy',
      tone: 'brand',
    });
  }
  if (!kyc || kyc.status === 'not_started' || kyc.status === 'rejected' || kyc.status === 'needs_manual_review') {
    gettingStarted.push({
      key: 'kyc',
      href: '/academy/verification',
      icon: ShieldCheck,
      label: kyc && kyc.status !== 'not_started' ? 'Verification needs your attention' : 'Complete KYC verification',
      meta: 'Unlocks the verified badge and public search',
      tone: 'brand',
    });
  }
  if (photos.length === 0) {
    gettingStarted.push({
      key: 'photos',
      href: '/academy/photos',
      icon: Images,
      label: 'Add academy photos',
      meta: 'A gallery helps families choose your academy',
      tone: 'info',
    });
  }
  if (pendingRequests.length > 0) {
    gettingStarted.push({
      key: 'teachers',
      href: '/academy/teachers',
      icon: UserCheck,
      label: `${pendingRequests.length} pending teacher ${pendingRequests.length === 1 ? 'request' : 'requests'}`,
      meta: 'Review who wants to join your academy',
      tone: 'info',
    });
  }

  const attentionItems: { key: string; href: string; icon: LucideIcon; label: string; meta: string; tone: 'error' | 'warning' | 'info' }[] = [];
  if (needsAttention.overdueScorecards > 0) {
    attentionItems.push({
      key: 'overdue-scorecards',
      href: '/academy/assessments',
      icon: NotebookPen,
      label: `${needsAttention.overdueScorecards} Offline Assessment ${needsAttention.overdueScorecards === 1 ? 'Scorecard' : 'Scorecards'}`,
      meta: 'Past deadline',
      tone: 'error',
    });
  }
  if (needsAttention.pendingLeaveRequests > 0) {
    attentionItems.push({
      key: 'pending-leave',
      href: '/academy/leave-requests',
      icon: CalendarOff,
      label: `${needsAttention.pendingLeaveRequests} Teacher Leave ${needsAttention.pendingLeaveRequests === 1 ? 'Request' : 'Requests'}`,
      meta: 'Awaiting your approval',
      tone: 'error',
    });
  }
  if (needsAttention.missingAttendance > 0) {
    attentionItems.push({
      key: 'missing-attendance',
      href: '/academy/attendance',
      icon: ClipboardCheck,
      label: `${needsAttention.missingAttendance} ${needsAttention.missingAttendance === 1 ? 'Class' : 'Classes'}`,
      meta: 'Attendance not recorded',
      tone: 'warning',
    });
  }
  if (needsAttention.pendingContactRequests > 0) {
    attentionItems.push({
      key: 'contact-requests',
      href: '/academy/contact-requests',
      icon: MessageCircle,
      label: `${needsAttention.pendingContactRequests} Contact ${needsAttention.pendingContactRequests === 1 ? 'Request' : 'Requests'}`,
      meta: 'Waiting for response',
      tone: 'warning',
    });
  }
  if (needsAttention.teachersWithoutWeeklyAssessment > 0) {
    attentionItems.push({
      key: 'weekly-assessment',
      href: '/academy/assessments',
      icon: NotebookPen,
      label: `${needsAttention.teachersWithoutWeeklyAssessment} ${needsAttention.teachersWithoutWeeklyAssessment === 1 ? 'Teacher' : 'Teachers'}`,
      meta: "Haven't scheduled this week's assessment",
      tone: 'info',
    });
  }

  const todaysHolidayName = todaysHolidays.governmentHolidays[0]?.name ?? todaysHolidays.academyHolidays[0]?.name ?? null;

  const activity: ActivityItem[] = [
    ...recentActivity.activeTeachers.map((t) => ({
      id: `teacher-${t.membershipId}`,
      icon: UserCheck,
      tone: 'success' as const,
      title: `${t.displayName ?? 'A teacher'} joined your academy`,
      timestamp: t.joinedAt,
      href: '/academy/teachers',
    })),
    ...recentActivity.contactRequests.map((r) => ({
      id: `contact-${r.id}`,
      icon: MessageCircle,
      tone: 'info' as const,
      title: `New contact request from ${r.studentDisplayName ?? 'a visitor'}`,
      timestamp: r.createdAt,
      href: '/academy/contact-requests',
      unread: !r.readAt,
    })),
    ...recentActivity.reviews.map((r) => ({
      id: `review-${r.id}`,
      icon: Star,
      tone: 'brand' as const,
      title: `New review from ${r.studentDisplayName ?? 'a student'} — ${r.rating}★`,
      timestamp: r.createdAt,
      href: '/academy/reviews',
    })),
    ...recentActivity.batches.map((b) => ({
      id: `batch-${b.id}`,
      icon: CalendarClock,
      tone: 'brand' as const,
      title: `Batch created: ${b.title}`,
      detail: b.tutorDisplayName ?? undefined,
      timestamp: b.createdAt,
      href: `/academy/batches`,
    })),
    ...recentActivity.leaveRequests.map((r) => ({
      id: `leave-${r.id}`,
      icon: CalendarOff,
      tone: (r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'error' : 'warning') as ActivityItem['tone'],
      title:
        r.status === 'pending'
          ? `${r.tutorDisplayName ?? 'A teacher'} applied for leave`
          : `${r.tutorDisplayName ?? "A teacher"}'s leave was ${r.status}`,
      timestamp: r.createdAt,
      href: '/academy/leave-requests',
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="space-y-8">
      <div className="animate-fade-up" style={{ animationDelay: '0ms' }}>
        <AcademyHero
          period={period}
          greeting={`${GREETING[period]}, ${profile.name} 👋`}
          subtitle="Here's what's happening with your academy."
        >
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
            {todayLabel(now)}
          </p>
        </AcademyHero>
      </div>

      {todaysHolidayName && (
        <div className="animate-fade-up rounded-xl border border-info-bg bg-info-bg/60 px-4 py-3 dark:border-info/20 dark:bg-info/10" style={{ animationDelay: '30ms' }}>
          <p className="flex items-center gap-2 text-sm font-medium text-info dark:text-info-dark">
            <PartyPopper className="h-4 w-4" aria-hidden />
            Holiday — Today is {todaysHolidayName}
          </p>
        </div>
      )}

      {gettingStarted.length > 0 && (
        <section className="animate-fade-up" style={{ animationDelay: '40ms' }}>
          <SectionHeader eyebrow="Getting started" title="Set up your academy" />
          <div className="grid gap-2 lg:grid-cols-2">
            {gettingStarted.map((item) => (
              <ActionCard key={item.key} href={item.href} icon={item.icon} label={item.label} meta={item.meta} tone={item.tone} />
            ))}
          </div>
        </section>
      )}

      <section className="animate-fade-up" style={{ animationDelay: '60ms' }}>
        <SectionHeader eyebrow="Overview" title="Today's summary" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard icon={CalendarDays} label="Classes today" value={overview.classesToday} />
          <StatCard
            icon={ClipboardCheck}
            label="Attendance recorded"
            value={`${overview.attendanceRecordedCount} / ${overview.classesToday}`}
          />
          <StatCard icon={Users} label="Teachers" value={`${overview.teachersActive - overview.teachersOnLeaveToday} / ${overview.teachersActive}`}>
            {overview.teachersOnLeaveToday > 0 && (
              <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                {overview.teachersOnLeaveToday} on leave
              </p>
            )}
          </StatCard>
          <StatCard icon={NotebookPen} label="Assessments today" value={overview.assessmentsToday} />
          <StatCard icon={CalendarOff} label="Cancelled classes" value={overview.classesCancelledToday} />
        </div>
      </section>

      <section className="animate-fade-up" style={{ animationDelay: '100ms' }}>
        <SectionHeader eyebrow="Your classroom" title="Today's classes" action={{ href: '/academy/timetable', label: 'Full timetable' }} />
        {classes.length === 0 ? (
          <EmptyPanel
            icon={CalendarDays}
            title="No classes scheduled today"
            description="Once your teachers' batches have sessions scheduled for today, they'll show up here."
          />
        ) : (
          <AcademyCard className="p-0">
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {classes.map((session) => (
                <li key={session.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
                  <span className="w-16 shrink-0 font-display text-base font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
                    {sessionTime(session)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      {session.batchTitle}
                    </span>
                    <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {session.tutorDisplayName ?? 'Teacher'} · {session.enrolledCount} students · {session.durationMin} min
                    </span>
                  </span>
                  <StatusBadge status={cancellationBadgeLabel(session) ?? session.status} />
                  {session.status !== 'cancelled' && (
                    <StatusBadge status={session.attendanceRecorded ? 'completed' : 'pending'} />
                  )}
                  {session.substituteDisplayName && (
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      Covered by {session.substituteDisplayName}
                    </span>
                  )}
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
        <SectionHeader eyebrow="What needs me" title="Needs attention" />
        {attentionItems.length === 0 ? (
          <EmptyPanel
            icon={CheckCircle2}
            title="All caught up"
            description="There are no pending academy actions right now."
          />
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {attentionItems.map((item) => (
              <ActionCard key={item.key} href={item.href} icon={item.icon} label={item.label} meta={item.meta} tone={item.tone} />
            ))}
          </div>
        )}
      </section>

      <section className="animate-fade-up" style={{ animationDelay: '180ms' }}>
        <SectionHeader eyebrow="What's next" title="Upcoming" />
        <AcademyCard className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
            Tomorrow, {new Date(`${upcoming.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {upcoming.classes} {upcoming.classes === 1 ? 'class' : 'classes'}
            {' · '}
            {upcoming.assessments} {upcoming.assessments === 1 ? 'assessment' : 'assessments'}
            {' · '}
            {upcoming.teacherLeave} teacher {upcoming.teacherLeave === 1 ? 'leave' : 'leaves'}
          </p>
        </AcademyCard>
      </section>

      <section className="animate-fade-up" style={{ animationDelay: '220ms' }}>
        <SectionHeader eyebrow="What's been happening" title="Recent activity" />
        {activity.length === 0 ? (
          <p className="text-sm text-neutral-400 dark:text-neutral-500">Nothing yet — activity shows up here as your academy grows.</p>
        ) : (
          <ActivityFeed items={activity.slice(0, 6)} />
        )}
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
