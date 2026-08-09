'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import posthog from 'posthog-js';
import {
  BookMarked,
  Megaphone,
  HelpCircle,
  ListChecks,
  CalendarCheck,
  ChevronDown,
  User,
  LogOut,
} from 'lucide-react';
import { api, apiPost, tokenStore, ApiError } from '@/lib/api';
import type { Me } from '@/lib/types';
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
  { href: '/student', label: 'Overview' },
  { href: '/student/schedule', label: 'Schedule' },
  { href: '/student/assignments', label: 'Assignments' },
  { href: '/student/materials', label: 'Materials' },
];

const MORE_NAV = [
  { href: '/student/batches', label: 'My Batches', icon: BookMarked },
  { href: '/student/attendance', label: 'Attendance', icon: CalendarCheck },
  { href: '/student/announcements', label: 'Announcements', icon: Megaphone },
  { href: '/student/doubts', label: 'Doubts / Help', icon: HelpCircle },
  { href: '/student/quizzes', label: 'Quizzes', icon: ListChecks },
];

export function StudentShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenStore.access) {
      router.replace('/login');
      return;
    }

    api
      .get<Me>('/auth/me')
      .then(setMe)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/login');
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

  const moreActive = MORE_NAV.some((item) => pathname.startsWith(item.href));
  const profileActive = pathname.startsWith('/student/profile');

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:border-neutral-800 dark:bg-neutral-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-8">
            <Link
              href="/student"
              className="font-display text-xl font-semibold italic text-brand-800 dark:text-brand-200"
            >
              Scholar
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              {NAV.map((item) => {
                const active =
                  item.href === '/student' ? pathname === item.href : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'
                        : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:shadow-focus-ring ${
                      moreActive
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'
                        : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'
                    }`}
                  >
                    More
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[13rem]">
                  {MORE_NAV.map((item) => (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link href={item.href}>
                        <item.icon className="h-4 w-4 text-neutral-400" aria-hidden />
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>
          </div>
          <div className="flex items-center gap-1.5">
            <NotificationsBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={`ml-1 flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:shadow-focus-ring ${
                    profileActive
                      ? 'bg-brand-600 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
                  }`}
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
                  <Link href="/student/profile">
                    <User className="h-4 w-4 text-neutral-400" aria-hidden />
                    Profile
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
        <nav className="flex items-center gap-1 overflow-x-auto border-t border-neutral-100 px-6 py-1.5 md:hidden dark:border-neutral-800">
          {[...NAV, ...MORE_NAV, { href: '/student/profile', label: 'Profile' }].map((item) => {
            const active =
              item.href === '/student' ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'
                    : 'text-neutral-600 dark:text-neutral-400'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
