'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import posthog from 'posthog-js';
import { api, tokenStore, ApiError } from '@/lib/api';
import type { Me } from '@/lib/types';
import { NotificationsBell } from '@/components/notifications-bell';

const NAV = [
  { href: '/dashboard', label: 'Today' },
  { href: '/dashboard/batches', label: 'Batches' },
  { href: '/dashboard/fees', label: 'Fees' },
  { href: '/dashboard/messages', label: 'Messages' },
];

const BUSINESS_NAV = [
  { href: '/dashboard/availability', label: 'Availability' },
  { href: '/dashboard/subjects', label: 'Subjects & rates' },
  { href: '/dashboard/verification', label: 'Verification' },
  { href: '/dashboard/billing', label: 'Billing & payouts' },
  { href: '/dashboard/marketplace', label: 'Marketplace' },
  { href: '/dashboard/quizzes', label: 'Quizzes' },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [businessMenuOpen, setBusinessMenuOpen] = useState(false);

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
    tokenStore.clear();
    if (posthog.__loaded) posthog.reset();
    router.replace('/login');
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="text-sm text-error">{error}</p>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="text-sm text-neutral-400">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="font-display text-xl font-semibold italic text-brand-800">
              Scholar
            </Link>
            <nav className="flex items-center gap-1">
              {NAV.map((item) => {
                const active =
                  item.href === '/dashboard'
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}

              <div className="relative">
                <button
                  onClick={() => setBusinessMenuOpen((open) => !open)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    BUSINESS_NAV.some((item) => pathname.startsWith(item.href))
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                  }`}
                >
                  Business ▾
                </button>
                {businessMenuOpen && (
                  <>
                    <button
                      aria-label="Close menu"
                      className="fixed inset-0 z-10 cursor-default"
                      onClick={() => setBusinessMenuOpen(false)}
                    />
                    <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-md border border-neutral-200 bg-white py-1 shadow-md">
                      {BUSINESS_NAV.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setBusinessMenuOpen(false)}
                          className={`block px-3 py-2 text-sm transition-colors ${
                            pathname.startsWith(item.href)
                              ? 'bg-brand-50 text-brand-700'
                              : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                          }`}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <Link
                href="/dashboard/profile"
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  pathname.startsWith('/dashboard/profile')
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                }`}
              >
                Profile
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <NotificationsBell />
            <span className="text-sm text-neutral-500">{me.phoneE164}</span>
            <button
              onClick={signOut}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
