'use client';

import { useEffect, useState } from 'react';
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
  School,
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
  Card,
  Field,
  Input,
  Button,
  InlineError,
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
  // true = normal case. Checked once up front so every page under
  // /academy/* is covered, not just the overview.
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

  if (!me || hasAcademy === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PageLoading />
      </div>
    );
  }

  if (!hasAcademy) {
    return <CreateAcademyScreen onCreated={() => setHasAcademy(true)} onSignOut={signOut} />;
  }

  const manageActive = MANAGE_NAV.some((item) => pathname.startsWith(item.href));

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:border-neutral-800 dark:bg-neutral-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-8">
            <Link
              href="/academy"
              className="flex items-center gap-2 font-display text-xl font-semibold italic text-brand-800 dark:text-brand-200"
            >
              <School className="h-5 w-5 not-italic" aria-hidden />
              Academy Dashboard
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
                  className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:shadow-focus-ring"
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
  );
}

/** Self-serve signup's bootstrap step — a fresh `academy`-role account
 *  (see login-form.tsx) has no `academies` row yet. This is the only
 *  screen such an account can reach; every other /academy/* page stays
 *  gated behind AcademyShell's hasAcademy check above. Posts straight to
 *  POST /academy/me (AcademyOwnerService.createMyAcademy) — everything
 *  else about the academy (description, subjects, location, photos...)
 *  is filled in afterward from the normal Academy Profile page. */
function CreateAcademyScreen({ onCreated, onSignOut }: { onCreated: () => void; onSignOut: () => void }) {
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2 font-display text-xl font-semibold italic text-brand-800 dark:text-brand-200">
          <School className="h-5 w-5 not-italic" aria-hidden />
          Academy Dashboard
        </div>
        <Card className="p-7">
          <h1 className="font-display text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            Name your academy
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            This creates your academy — you can fill in the description, subjects, location, and photos afterward
            from Academy Profile.
          </p>

          <div className="mt-5">
            <Field label="Academy name" required>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Bright Future Academy"
                autoFocus
                maxLength={200}
              />
            </Field>
          </div>

          {error && (
            <div className="mt-3">
              <InlineError>{error}</InlineError>
            </div>
          )}

          <Button className="mt-5 w-full" onClick={() => void submit()} disabled={saving || !name.trim()} loading={saving}>
            {saving ? 'Creating…' : 'Create Academy'}
          </Button>

          <button
            type="button"
            onClick={onSignOut}
            className="mt-4 w-full text-center text-xs font-medium text-neutral-400 hover:text-neutral-600 hover:underline dark:text-neutral-500 dark:hover:text-neutral-300"
          >
            Sign out
          </button>
        </Card>
      </div>
    </div>
  );
}
