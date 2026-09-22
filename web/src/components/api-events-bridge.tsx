'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import posthog from 'posthog-js';
import { onSessionLost } from '@/lib/api';
import { impersonationStore } from '@/lib/impersonation';

/**
 * The app's single response to "the API says your session is gone" — raised
 * by the api client once per lost session, after its silent token refresh
 * failed. Pages never check for 401 themselves.
 *
 *  - a Super Admin "view as user" token expiring is "the view ended", not
 *    "you were signed out": back to /admin
 *  - anything else: to /login, remembering where the user was so signing in
 *    lands them back there
 */
export function ApiEventsBridge() {
  const router = useRouter();

  useEffect(
    () =>
      onSessionLost(() => {
        if (impersonationStore.active) {
          void impersonationStore.stop().then(() => router.replace('/admin'));
          return;
        }
        if (posthog.__loaded) posthog.reset();
        const { pathname, search } = window.location;
        if (pathname.startsWith('/login')) return;
        const here = `${pathname}${search}`;
        router.replace(here === '/' ? '/login' : `/login?next=${encodeURIComponent(here)}`);
      }),
    [router],
  );

  return null;
}
