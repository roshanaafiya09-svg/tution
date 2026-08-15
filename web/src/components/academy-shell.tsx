'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import posthog from 'posthog-js';
import {
  Home,
  Users,
  MessageCircle,
  Building2,
  Images,
  Star,
  CalendarClock,
  GraduationCap,
  Settings,
  ChevronDown,
  LogOut,
} from 'lucide-react';
import { api, apiPost, tokenStore, ApiError } from '@/lib/api';
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
  DropdownMenuLabel,
} from '@/components/ui';

const NAV = [
  { href: '/academy', label: 'Overview', icon: Home },
  { href: '/academy/teachers', label: 'Teachers', icon: Users },
  { href: '/academy/contact-requests', label: 'Contact Requests', icon: MessageCircle },
];

const MANAGE_GROUPS = [
  {
    label: 'Academy',
    items: [
      { href: '/academy/profile', label: 'Academy Profile', icon: Building2 },
      { href: '/academy/photos', label: 'Photos', icon: Images },
      { href: '/academy/reviews', label: 'Reviews', icon: Star },
    ],
  },
  {
    label: 'Classes',
    items: [
      { href: '/academy/batches', label: 'Batches', icon: CalendarClock },
      { href: '/academy/students', label: 'Students', icon: GraduationCap },
    ],
  },
  {
    label: 'Account',
    items: [{ href: '/academy/settings', label: 'Settings', icon: Settings }],
  },
];

const MANAGE_NAV = MANAGE_GROUPS.flatMap((group) => group.items);

/** Lets the Overview page (the only page that can create the academy —
 *  see CreateAcademyCard in app/academy/page.tsx) tell this shell the
 *  academy now exists, so the other-pages nav-guard below stops bouncing
 *  navigation back to /academy. */
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
 * Self-serve Academy Dashboard shell — a 5th hand-rolled shell alongside
 * DashboardShell/ParentShell/StudentShell/AdminShell (this codebase has
 * no shared generic shell abstraction to extend; each role's shell is
 * its own component by established convention). Client-side gate is
 * convenience only — the real enforcement is the backend's
 * @Roles('academy') on every /academy/* endpoint, resolved server-side
 * from owner_user_id, never a client-supplied academy id.
 */
export function AcademyShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  // null = still checking, false = signed-up academy user with no
  // `academies` row yet (fresh self-serve signup — see login-form.tsx),
  // true = normal case. The Overview page (/academy) is the only page
  // that knows how to render itself in the `false` case (a "set up your
  // academy" prompt, fetched independently there) — every other page
  // under /academy/* assumes a real academy row exists, so this shell
  // bounces those back to the overview until one does.
  const [hasAcademy, setHasAcademy] = useState<boolean | null>(null);

  useEffect(() => {
    if (!tokenStore.access) {
      router.replace('/login');
      return;
    }

    api
      .get<Me>('/auth/me')
      .then(async (account) => {
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
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/login');
        } else {
          setError('Could not load your account.');
        }
      });
  }, [router]);

  // A fresh academy account with no academies row yet can only usefully
  // render the Overview page (which prompts it to set one up) — every
  // other page under /academy/* would just 404 against the backend.
  useEffect(() => {
    if (hasAcademy === false && pathname !== '/academy') {
      router.replace('/academy');
    }
  }, [hasAcademy, pathname, router]);

  function signOut() {
    const refreshToken = tokenStore.refresh;
    tokenStore.clear();
    if (posthog.__loaded) posthog.reset();
    router.replace('/login');
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

  if (!me || hasAcademy === null || (hasAcademy === false && pathname !== '/academy')) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PageLoading />
      </div>
    );
  }

  const manageActive = MANAGE_NAV.some((item) => pathname.startsWith(item.href));
  const profileActive = pathname.startsWith('/academy/profile');

  return (
    <AcademyDashboardContext.Provider value={{ hasAcademy, markAcademyCreated: () => setHasAcademy(true) }}>
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:border-neutral-800 dark:bg-neutral-950/80">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
            <div className="flex items-center gap-8">
              <Link
                href="/academy"
                className="font-display text-xl font-semibold italic text-brand-800 dark:text-brand-200"
              >
                Scholar
              </Link>
              <nav className="hidden items-center gap-1 md:flex">
                {NAV.map((item) => {
                  const active = item.href === '/academy' ? pathname === item.href : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                        active
                          ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'
                          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100',
                      )}
                    >
                      <item.icon className="h-3.5 w-3.5" aria-hidden />
                      {item.label}
                    </Link>
                  );
                })}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        'flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:shadow-focus-ring',
                        manageActive
                          ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'
                          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100',
                      )}
                    >
                      Manage
                      <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[14rem]">
                    {MANAGE_GROUPS.map((group, i) => (
                      <div key={group.label}>
                        {i > 0 && <DropdownMenuSeparator />}
                        <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                        {group.items.map((item) => {
                          const active = pathname.startsWith(item.href);
                          return (
                            <DropdownMenuItem key={item.href} asChild>
                              <Link
                                href={item.href}
                                className={cn(
                                  active && 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200',
                                )}
                              >
                                <item.icon
                                  className={cn('h-4 w-4', active ? 'text-brand-600 dark:text-brand-300' : 'text-neutral-400')}
                                  aria-hidden
                                />
                                {item.label}
                              </Link>
                            </DropdownMenuItem>
                          );
                        })}
                      </div>
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
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={signOut} className="text-error dark:text-error-dark">
                    <LogOut className="h-4 w-4" aria-hidden />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <nav className="flex items-center gap-1 overflow-x-auto border-t border-neutral-100 px-4 py-1.5 md:hidden dark:border-neutral-800">
            {[...NAV, ...MANAGE_NAV].map((item) => {
              const active = item.href === '/academy' ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'
                      : 'text-neutral-600 dark:text-neutral-400',
                  )}
                >
                  <item.icon className="h-3.5 w-3.5" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </div>
    </AcademyDashboardContext.Provider>
  );
}
