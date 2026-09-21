'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { api } from '@/lib/api';
import { clearCachedFetch } from '@/lib/use-cached-fetch';
import {
  INDIVIDUAL,
  academyContext,
  academyIdFromContext,
  teachingContext,
  type AvailableTeachingContexts,
  type TeachingContextValue,
} from '@/lib/teaching-context';

export interface TeachingProfile {
  /** Wire value sent as X-Teaching-Context. */
  value: TeachingContextValue;
  kind: 'individual' | 'academy';
  label: string;
  academyId: string | null;
}

interface TeachingContextState {
  /** The profile every request is currently made in. */
  current: TeachingProfile;
  /** Individual first, then one entry per academy the teacher is an ACTIVE member of. */
  profiles: TeachingProfile[];
  ready: boolean;
  switchTo: (value: TeachingContextValue) => void;
}

const INDIVIDUAL_PROFILE: TeachingProfile = {
  value: INDIVIDUAL,
  kind: 'individual',
  label: 'Individual Teaching',
  academyId: null,
};

const Ctx = createContext<TeachingContextState>({
  current: INDIVIDUAL_PROFILE,
  profiles: [INDIVIDUAL_PROFILE],
  ready: false,
  switchTo: () => undefined,
});

export function useTeachingContext(): TeachingContextState {
  return useContext(Ctx);
}

/**
 * Owns the teacher's profile switcher state. Loads the profiles they may
 * work in (Individual + active academy memberships) and drops a remembered
 * academy they no longer belong to (e.g. after leaving it) back to
 * Individual — the backend would reject it anyway, this just keeps the UI
 * honest. Switching clears every cached dashboard bundle so nothing from the
 * other profile is ever shown; pages re-mount and refetch under the new
 * profile (see `contextKey` use in DashboardShell).
 */
export function TeachingContextProvider({ children }: { children: React.ReactNode }) {
  const selected = useSyncExternalStore(
    teachingContext.subscribe,
    () => teachingContext.value,
    () => INDIVIDUAL,
  );
  const [available, setAvailable] = useState<AvailableTeachingContexts | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .get<AvailableTeachingContexts>('/teaching-contexts/me')
      .then((result) => {
        if (cancelled) return;
        setAvailable(result);
        const wanted = academyIdFromContext(teachingContext.value);
        if (wanted && !result.academies.some((a) => a.academyId === wanted)) {
          clearCachedFetch();
          teachingContext.reset();
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Couldn't verify — fail safe to Individual rather than keep an academy profile.
        setAvailable({ individual: { kind: 'individual' }, academies: [] });
        teachingContext.reset();
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const profiles = useMemo<TeachingProfile[]>(
    () => [
      INDIVIDUAL_PROFILE,
      ...(available?.academies ?? []).map((a) => ({
        value: academyContext(a.academyId),
        kind: 'academy' as const,
        label: a.name,
        academyId: a.academyId,
      })),
    ],
    [available],
  );

  const current = profiles.find((p) => p.value === selected) ?? INDIVIDUAL_PROFILE;

  const switchTo = useCallback((value: TeachingContextValue) => {
    if (value === teachingContext.value) return;
    clearCachedFetch();
    teachingContext.set(value);
  }, []);

  const state = useMemo(
    () => ({ current, profiles, ready: available !== null, switchTo }),
    [current, profiles, available, switchTo],
  );

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}
