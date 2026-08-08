'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import posthog from 'posthog-js';
import { User, LogOut } from 'lucide-react';
import { api, apiPost, tokenStore, ApiError } from '@/lib/api';
import type { Me } from '@/lib/types';
import { impersonationStore } from '@/lib/impersonation';
import type { ImpersonationTarget } from '@/lib/impersonation';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { NotificationsBell } from '@/components/notifications-bell';
import {
  PageLoading,
  ErrorState,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui';

const NAV = [
  { href: '/parent', label: 'Home' },
  { href: '/parent/link', label: 'Link a child' },
  { href: '/parent/messages', label: 'Messages' },
  { href: '/parent/premium', label: 'Premium' },
];

export function ParentShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState<ImpersonationTarget | null>(null);

  useEffect(() => {
    if (!tokenStore.access) {
      router.replace('/login?next=/parent');
      return;
    }

    setImpersonating(impersonationStore.target);

    api
      .get<Me>('/auth/me')
      .then(setMe)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          // See DashboardShell's identical branch: an expired
          // impersonation token means "session ended," not "signed out."
          if (impersonationStore.active) {
            impersonationStore.stop();
            router.replace('/admin');
          } else {
            router.replace('/login?next=/parent');
          }
        } else {
          setError('Could not load your account.');
        }
      });
  }, [router]);

  function signOut() {
    const refreshToken = tokenStore.refresh;
    tokenStore.clear();
    if (posthog.__loaded) posthog.reset();
    router.replace('/login');
    // Best-effort: the device is signed out locally regardless of
    // whether this reaches the server, but a reachable one should
    // actually revoke the refresh token rather than leave it valid.
    if (refreshToken) {
      void apiPost('/auth/logout', { refreshToken }).catch(() => {});
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <ErrorState description={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PageLoading />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {impersonating && <ImpersonationBanner target={impersonating} />}
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:border-neutral-800 dark:bg-neutral-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-8">
            <Link
              href="/parent"
              className="font-display text-xl font-semibold italic text-brand-800 dark:text-brand-200"
            >
              Scholar
            </Link>
            <nav className="flex items-center gap-1 overflow-x-auto">
              {NAV.map((item) => {
                const active =
                  item.href === '/parent' ? pathname === item.href : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'
                        : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-1.5">
            <NotificationsBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-sm font-semibold text-neutral-600 transition-colors hover:bg-neutral-200 focus-visible:outline-none focus-visible:shadow-focus-ring dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                  aria-label="Account menu"
                >
                  {me.phoneE164.slice(-2)}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-[14rem]">
                <div className="px-2.5 py-1.5 text-xs text-neutral-400 dark:text-neutral-500">Signed in as</div>
                <div className="px-2.5 pb-2 text-sm font-medium text-neutral-800 dark:text-neutral-100">
                  {me.phoneE164}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/parent/link">
                    <User className="h-4 w-4 text-neutral-400" aria-hidden />
                    Link a child
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={signOut} className="text-error dark:text-error-dark">
                  <LogOut className="h-4 w-4" aria-hidden />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
