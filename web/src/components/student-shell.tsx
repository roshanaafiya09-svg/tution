'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import posthog from 'posthog-js';
import { LogOut, Menu, Settings, User } from 'lucide-react';
import { api, apiPost, tokenStore, ApiError } from '@/lib/api';
import type { Me, StudentProfile } from '@/lib/types';
import { NotificationsBell } from '@/components/notifications-bell';
import { cn } from '@/lib/cn';
import {
  PageLoading,
  ErrorState,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui';
import {
  StudentSidebar,
  StudentSidebarDrawer,
  SIDEBAR_WIDTH_COLLAPSED,
  SIDEBAR_WIDTH_EXPANDED,
} from '@/components/dashboard/student-sidebar';
import { studentPageTitle, studentNotificationHref } from '@/components/dashboard/student-nav';

const COLLAPSE_KEY = 'scholar.studentSidebarCollapsed';

/** Tracks a media query as React state. The shell only renders once
 *  `/auth/me` has resolved, so there's no server render to mismatch. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Student Portal shell — same sidebar component, layout, and page-container
 * structure as `DashboardShell` (Teacher) and `AcademyShell`; only the nav
 * config (`StudentSidebar`) and account-menu items differ. See the Student
 * Dashboard Side Navigation & UX Redesign spec §1.
 */
export function StudentShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsedPref, setCollapsedPref] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const isTabletUp = useMediaQuery('(min-width: 768px)');
  const collapsed = isDesktop ? collapsedPref : true;

  useEffect(() => {
    setCollapsedPref(window.localStorage.getItem(COLLAPSE_KEY) === '1');
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedPref((current) => {
      window.localStorage.setItem(COLLAPSE_KEY, current ? '0' : '1');
      return !current;
    });
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

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

    api
      .get<StudentProfile | undefined>('/profiles/student/me')
      .then((p) => setProfile(p ?? null))
      .catch(() => setProfile(null));
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

  const profileActive = pathname.startsWith('/student/account');
  const pageTitle = studentPageTitle(pathname);

  return (
    <div className="min-h-screen bg-background">
      <StudentSidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} canToggle={isDesktop} />
      <StudentSidebarDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <div
        className="flex min-h-screen flex-col transition-[padding] duration-base"
        style={{
          paddingLeft: isTabletUp ? (collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED) : undefined,
        }}
      >
        <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 dark:border-neutral-800/80">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
              className="-ml-1 rounded-md p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:shadow-focus-ring md:hidden dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>

            <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
              <Link
                href="/student"
                className="hidden shrink-0 font-display text-sm italic text-neutral-400 transition-colors hover:text-neutral-600 sm:block dark:text-neutral-500 dark:hover:text-neutral-300"
              >
                Scholar
              </Link>
              <span className="hidden shrink-0 text-sm text-neutral-300 sm:block dark:text-neutral-700" aria-hidden>
                /
              </span>
              <h1 className="min-w-0 truncate text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                {pageTitle}
              </h1>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <NotificationsBell resolveHref={studentNotificationHref} />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      'ml-1 flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:shadow-focus-ring',
                      profileActive
                        ? 'bg-brand-600 text-white dark:bg-brand-500 dark:text-neutral-950'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700',
                    )}
                    aria-label="Account menu"
                  >
                    {profile ? initials(profile.display_name) : me.phoneE164.slice(-2)}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="min-w-[14rem]">
                  <div className="px-2.5 py-1.5 text-xs text-neutral-400 dark:text-neutral-500">Signed in as</div>
                  <div className="px-2.5 pb-2">
                    {profile && (
                      <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
                        {profile.display_name}
                      </p>
                    )}
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">{me.phoneE164}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/student/account">
                      <User className="h-4 w-4 text-neutral-400" aria-hidden />
                      Account
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/student/settings">
                      <Settings className="h-4 w-4 text-neutral-400" aria-hidden />
                      Settings
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

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
