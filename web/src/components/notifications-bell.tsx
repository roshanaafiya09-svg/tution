'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '@/lib/api';
import type { AppNotification } from '@/lib/types';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui';

/**
 * Optional, portal-supplied type→route mapping. The same notification
 * `type` (e.g. "announcement") routes to a different page depending on
 * which portal is viewing it (a tutor's announcement goes to their batch
 * detail page, a student's to their own announcements), so the mapping
 * can't live inside this shared component — each shell passes its own.
 * Returning null (or omitting the prop entirely) keeps the existing
 * mark-read-only behavior, so portals that haven't wired this up yet see
 * no change.
 */
export type NotificationHrefResolver = (notification: AppNotification) => string | null;

export function NotificationsBell({ resolveHref }: { resolveHref?: NotificationHrefResolver } = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);

  const loadCount = useCallback(async () => {
    const { count } = await api.get<{ count: number }>('/notifications/unread-count');
    setUnreadCount(count);
  }, []);

  useEffect(() => {
    void loadCount();
    const interval = setInterval(() => void loadCount(), 30_000);
    return () => clearInterval(interval);
  }, [loadCount]);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && notifications === null) {
      setNotifications(await api.get<AppNotification[]>('/notifications'));
    }
  }

  async function markRead(id: string) {
    await api.post(`/notifications/${id}/read`);
    setNotifications(await api.get<AppNotification[]>('/notifications'));
    await loadCount();
  }

  async function handleSelect(n: AppNotification) {
    if (!n.read_at) await markRead(n.id);
    const href = resolveHref?.(n);
    if (href) {
      setOpen(false);
      router.push(href);
    }
  }

  async function markAllRead() {
    await api.post('/notifications/read-all');
    setNotifications(await api.get<AppNotification[]>('/notifications'));
    await loadCount();
  }

  return (
    <Popover open={open} onOpenChange={(next) => void handleOpenChange(next)}>
      <PopoverTrigger asChild>
        <button
          aria-label="Notifications"
          className="relative rounded-md p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:shadow-focus-ring dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        >
          <Bell className="h-[18px] w-[18px]" aria-hidden />
          {unreadCount > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-semibold leading-none text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5 dark:border-neutral-800">
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Notifications</p>
          {unreadCount > 0 && (
            <button
              onClick={() => void markAllRead()}
              className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-300"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications === null ? (
            <p className="px-4 py-8 text-center text-sm text-neutral-400 dark:text-neutral-500">Loading…</p>
          ) : notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No notifications yet.
            </p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => void handleSelect(n)}
                className={`block w-full border-b border-neutral-50 px-4 py-3 text-left text-sm transition-colors last:border-0 hover:bg-neutral-50 dark:border-neutral-800/60 dark:hover:bg-neutral-800/40 ${
                  n.read_at ? '' : 'bg-brand-50/60 dark:bg-brand-500/10'
                }`}
              >
                <div className="flex items-start gap-2">
                  {!n.read_at && (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-neutral-900 dark:text-neutral-50">{n.payload.title}</p>
                    <p className="mt-0.5 text-neutral-600 dark:text-neutral-400">{n.payload.body}</p>
                    <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                      {new Date(n.created_at).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
