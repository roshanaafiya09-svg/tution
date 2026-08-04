'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { AppNotification } from '@/lib/types';

export function NotificationsBell() {
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

  async function toggleOpen() {
    const next = !open;
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

  async function markAllRead() {
    await api.post('/notifications/read-all');
    setNotifications(await api.get<AppNotification[]>('/notifications'));
    await loadCount();
  }

  return (
    <div className="relative">
      <button
        onClick={() => void toggleOpen()}
        aria-label="Notifications"
        className="relative rounded-md p-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            aria-label="Close notifications"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-20 mt-1 w-80 rounded-md border border-neutral-200 bg-white shadow-md">
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2">
              <p className="text-sm font-medium text-neutral-900">Notifications</p>
              {unreadCount > 0 && (
                <button
                  onClick={() => void markAllRead()}
                  className="text-xs font-medium text-brand-700 hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications === null ? (
                <p className="px-4 py-6 text-center text-sm text-neutral-400">Loading…</p>
              ) : notifications.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-neutral-500">No notifications yet.</p>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => !n.read_at && void markRead(n.id)}
                    className={`block w-full px-4 py-3 text-left text-sm transition-colors hover:bg-neutral-50 ${
                      n.read_at ? '' : 'bg-brand-50/50'
                    }`}
                  >
                    <p className="font-medium text-neutral-900">{n.payload.title}</p>
                    <p className="mt-0.5 text-neutral-600">{n.payload.body}</p>
                    <p className="mt-1 text-xs text-neutral-400">
                      {new Date(n.created_at).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
