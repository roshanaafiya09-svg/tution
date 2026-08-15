'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Award, GraduationCap, MessageCircle, Star, Users, CalendarClock } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type {
  AcademyOwnerProfile,
  AcademyOwnerStats,
  AcademyPendingRequest,
  ContactRequest,
} from '@/lib/types';
import {
  Badge,
  Button,
  Card,
  CardSkeleton,
  ErrorState,
  Field,
  InlineError,
  Input,
  StatCard,
  StatusBadge,
} from '@/components/ui';
import { AcademyCard, AcademyHero, AcademyPageIntro, AcademySectionHeader, type DayPeriod } from '@/components/academy';
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

export default function AcademyOverviewPage() {
  const { markAcademyCreated } = useAcademyDashboard();
  const [profile, setProfile] = useState<AcademyOwnerProfile | null>(null);
  const [stats, setStats] = useState<AcademyOwnerStats | null>(null);
  const [pendingRequests, setPendingRequests] = useState<AcademyPendingRequest[]>([]);
  const [contactRequests, setContactRequests] = useState<ContactRequest[]>([]);
  const [loadError, setLoadError] = useState(false);
  // null = still checking, false = signed-up academy account with no
  // `academies` row yet (fresh self-serve signup — see login-form.tsx
  // and AcademyShell), true = normal case.
  const [hasAcademy, setHasAcademy] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const profileRes = await api.get<AcademyOwnerProfile>('/academy/me');
      setProfile(profileRes);
      setHasAcademy(true);
      const [statsRes, pendingRes, contactRes] = await Promise.all([
        api.get<AcademyOwnerStats>('/academy/me/stats'),
        api.get<AcademyPendingRequest[]>('/academy/me/teachers/pending'),
        api.get<ContactRequest[]>('/academy/me/contact-requests'),
      ]);
      setStats(statsRes);
      setPendingRequests(pendingRes);
      setContactRequests(contactRes);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setHasAcademy(false);
      } else {
        setLoadError(true);
      }
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

  if (hasAcademy === false) {
    return (
      <CreateAcademyCard
        onCreated={() => {
          markAcademyCreated();
          void load();
        }}
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

  return (
    <div>
      <div className="animate-fade-up" style={{ animationDelay: '0ms' }}>
        <AcademyHero
          period={period}
          greeting={`${GREETING[period]}, ${profile.name} 👋`}
          subtitle="Here's what's happening at your academy today."
        />
      </div>

      <div className="mt-8 grid gap-4 animate-fade-up sm:grid-cols-2 lg:grid-cols-4" style={{ animationDelay: '80ms' }}>
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

      <div className="mt-8 flex flex-wrap animate-fade-up gap-2" style={{ animationDelay: '120ms' }}>
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

      <section className="mt-8 animate-fade-up" style={{ animationDelay: '160ms' }}>
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
      </section>

      <section className="mt-8 animate-fade-up" style={{ animationDelay: '200ms' }}>
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
      </section>

      <section className="mt-8 animate-fade-up" style={{ animationDelay: '240ms' }}>
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

/** Self-serve signup's bootstrap step (see login-form.tsx's 'academy'-role
 *  signup and AcademyShell) — a fresh `academy`-role account has no
 *  `academies` row yet. Renders inline on the normal dashboard shell,
 *  rather than replacing it, so the account lands on /academy immediately
 *  after signup and can set up whenever it's ready. Posts straight to
 *  POST /academy/me (AcademyOwnerService.createMyAcademy) — everything
 *  else about the academy (description, subjects, location, photos...)
 *  is filled in afterward from Academy Profile. */
function CreateAcademyCard({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSaving(true);
    try {
      await api.post('/academy/me', { name: name.trim() });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your academy.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <AcademyPageIntro
        eyebrow="Academy Dashboard"
        title="Set up your academy"
        description="Give your academy a name to get started — you can add a description, subjects, location, and photos afterward from Academy Profile."
      />
      <Card className="mt-8 max-w-md p-7">
        <Field label="Academy name" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bright Future Academy"
            autoFocus
            maxLength={200}
          />
        </Field>

        {error && (
          <div className="mt-3">
            <InlineError>{error}</InlineError>
          </div>
        )}

        <Button
          className="mt-5 w-full sm:w-auto"
          onClick={() => void submit()}
          disabled={saving || !name.trim()}
          loading={saving}
        >
          {saving ? 'Creating…' : 'Create Academy Profile'}
        </Button>
      </Card>
    </div>
  );
}
