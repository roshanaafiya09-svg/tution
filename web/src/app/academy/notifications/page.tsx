'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '@/lib/api';
import type { AppNotification } from '@/lib/types';
import { academyNotificationHref } from '@/components/dashboard/academy-nav';
import { Button, CardSkeleton, EmptyState, ErrorState } from '@/components/ui';
import { AcademyCard, AcademyPageIntro, AcademySetupBanner } from '@/components/academy';
import { cn } from '@/lib/cn';
import { useAcademyDashboard } from '@/components/academy-shell';

type Tab = 'all' | 'unread' | 'read';

export default function AcademyNotificationsPage() {
  const router = useRouter();
  const { hasAcademy } = useAcademyDashboard();
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<Tab>('all');

  const load = useCallback(async () => {
    if (hasAcademy === false) {
      setNotifications([]);
      return;
    }
    setLoadError(false);
    try {
      setNotifications(await api.get<AppNotification[]>('/notifications'));
    } catch {
      setLoadError(true);
    }
  }, [hasAcademy]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!notifications) return [];
    if (tab === 'unread') return notifications.filter((n) => !n.read_at);
    if (tab === 'read') return notifications.filter((n) => n.read_at);
    return notifications;
  }, [notifications, tab]);

  const unreadCount = notifications?.filter((n) => !n.read_at).length ?? 0;

  async function markRead(id: string) {
    await api.post(`/notifications/${id}/read`);
    setNotifications((prev) => prev?.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)) ?? null);
  }

  async function markAllRead() {
    await api.post('/notifications/read-all');
    setNotifications((prev) => prev?.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) ?? null);
  }

  async function handleSelect(n: AppNotification) {
    if (!n.read_at) await markRead(n.id);
    const href = academyNotificationHref(n);
    if (href) router.push(href);
  }

  if (loadError) {
    return <ErrorState description="Could not load notifications. Check your connection and try again." onRetry={() => void load()} />;
  }

  return (
    <div>
      <AcademySetupBanner />
      <AcademyPageIntro
        eyebrow="Academy Dashboard"
        title="Notifications"
        description="Everything relevant to your academy, in one place."
        action={
          unreadCount > 0 && (
            <Button variant="secondary" size="sm" onClick={() => void markAllRead()}>
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              Mark all read
            </Button>
          )
        }
      />

      <div className="mt-6 flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {(['all', 'unread', 'read'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium capitalize transition-colors',
              tab === t
                ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-200'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100',
            )}
          >
            {t}
            {t === 'unread' && unreadCount > 0 && (
              <span className="rounded-full bg-error-bg px-1.5 py-0.5 text-xs font-semibold text-error dark:bg-error/15 dark:text-error-dark">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {notifications === null ? (
          <div className="space-y-3">
            <CardSkeleton className="h-16 rounded-2xl" />
            <CardSkeleton className="h-16 rounded-2xl" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={tab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            description="Updates about join requests, leave requests, contact requests, and your own announcements will appear here."
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((n) => {
              const href = academyNotificationHref(n);
              return (
                <AcademyCard
                  key={n.id}
                  interactive={href !== null || !n.read_at}
                  onClick={() => void handleSelect(n)}
                  className={cn('flex items-start gap-3 p-4', !n.read_at && 'border-brand-200 bg-brand-50/40 dark:border-brand-500/25 dark:bg-brand-500/10')}
                >
                  {!n.read_at && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{n.payload.title}</p>
                    <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">{n.payload.body}</p>
                    <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                      {new Date(n.created_at).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </AcademyCard>
              );
            })}
            <p className="pt-2 text-center text-xs text-neutral-400 dark:text-neutral-500">Showing your most recent 50.</p>
          </div>
        )}
      </div>
    </div>
  );
}
