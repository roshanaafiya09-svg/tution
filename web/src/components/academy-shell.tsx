'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import posthog from 'posthog-js';
import { LogOut, Menu, Settings, Building2 } from 'lucide-react';
import { api, apiLogout, ensureSession, ApiError } from '@/lib/api';
import type { Me } from '@/lib/types';
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
  AcademySidebar,
  AcademySidebarDrawer,
  SIDEBAR_WIDTH_COLLAPSED,
  SIDEBAR_WIDTH_EXPANDED,
} from '@/components/dashboard/academy-sidebar';
import { academyPageTitle } from '@/components/dashboard/academy-nav';

const COLLAPSE_KEY = 'scholar.academySidebarCollapsed';

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

/** Lets any page know whether the account has an `academies` row yet,
 *  without forcing a redirect — see this file's nav-guard doc comment
 *  below. Pages other than Today/Academy Profile render
 *  `<AcademySetupRequired />` in place of their normal content while this
 *  is `false`, instead of hitting an API that can only 404. */
const AcademyDashboardContext = createContext<{
  hasAcademy: boolean | null;
  markAcademyCreated: () => void;
} | null>(null);

export function useAcademyDashboard() {
  const ctx = useContext(AcademyDashboardContext);
  if (!ctx) {
    throw new Error('useAcademyDashboard must be used within AcademyShell');
  }
  return ctx;
}

/**
 * Self-serve Academy Dashboard shell — same structure, sidebar component,
 * and page-container layout as `DashboardShell` (Teacher Portal); only the
 * nav config (`AcademySidebar`) and account-menu items differ, per the
 * Navigation, Routing & UX Update spec. Client-side gate is convenience
 * only — the real enforcement is the backend's @Roles('academy') on every
 * /academy/* endpoint, resolved server-side from owner_user_id, never a
 * client-supplied academy id.
 */
export function AcademyShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsedPref, setCollapsedPref] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const isTabletUp = useMediaQuery('(min-width: 768px)');
  const collapsed = isDesktop ? collapsedPref : true;

  // null = still checking, false = signed-up academy user with no
  // `academies` row yet (fresh self-serve signup — see login-form.tsx),
  // true = normal case. No page is ever bounced back to /academy for
  // this — see AcademySetupRequired's doc comment for why.
  const [hasAcademy, setHasAcademy] = useState<boolean | null>(null);

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
    void (async () => {
      if (!(await ensureSession())) {
        router.replace('/login');
        return;
      }

      try {
        const account = await api.get<Me>('/auth/me');
        if (!account.roles.includes('academy')) {
          router.replace('/get-the-app');
          return;
        }
        setMe(account);
        try {
          await api.get('/academy/me');
          setHasAcademy(true);
        } catch (err: unknown) {
          if (err instanceof ApiError && err.status === 404) {
            setHasAcademy(false);
          } else {
            setError('Could not load your academy.');
          }
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/login');
        } else {
          setError('Could not load your account.');
        }
      }
    })();
  }, [router]);

  function signOut() {
    if (posthog.__loaded) posthog.reset();
    router.replace('/login');
    void apiLogout();
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <ErrorState description={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (!me || hasAcademy === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PageLoading />
      </div>
    );
  }

  const profileActive = pathname.startsWith('/academy/profile');
  const pageTitle = academyPageTitle(pathname);

  return (
    <AcademyDashboardContext.Provider value={{ hasAcademy, markAcademyCreated: () => setHasAcademy(true) }}>
      <div className="min-h-screen bg-background">
        <AcademySidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} canToggle={isDesktop} />
        <AcademySidebarDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

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
                  href="/academy"
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
                <NotificationsBell />

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
                      {me.phoneE164.slice(-2)}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="min-w-[14rem]">
                    <div className="px-2.5 py-1.5 text-xs text-neutral-400 dark:text-neutral-500">Signed in as</div>
                    <div className="px-2.5 pb-2 text-sm font-medium text-neutral-800 dark:text-neutral-100">
                      {me.email ?? me.phoneE164}
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/academy/profile">
                        <Building2 className="h-4 w-4 text-neutral-400" aria-hidden />
                        Academy Profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/academy/settings">
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
    </AcademyDashboardContext.Provider>
  );
}
