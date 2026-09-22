'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { api, toApiError, type ApiError } from '@/lib/api';
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
  /** Set when the allowed profiles could not be loaded. The remembered
   *  profile is deliberately left untouched in that case — see below. */
  error: ApiError | null;
  reload: () => void;
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
  error: null,
  reload: () => undefined,
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
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void api
      .get<AvailableTeachingContexts>('/teaching-contexts/me')
      .then((result) => {
        if (cancelled) return;
        setAvailable(result);
        const wanted = academyIdFromContext(teachingContext.value);
        if (wanted && !result.academies.some((a) => a.academyId === wanted)) {
          // The server answered, and the remembered academy is not among the
          // teacher's active memberships (they left it): safe to drop it.
          clearCachedFetch();
          teachingContext.reset();
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // The server did NOT answer usefully, so we do not know whether the
        // remembered profile is still valid. Silently resetting to Individual
        // here (as this used to) would make the label say "Individual" while
        // the user believed they were in an academy, and hide the real error.
        // Keep the profile, report the failure, let the shell offer Retry —
        // pages stay held back (they only render once `ready`).
        setError(toApiError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

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

  // A remembered academy that is not in the loaded list is only ever shown as
  // Individual once the list has actually loaded (and the provider has reset
  // the selection). Before that — or if loading failed — label it truthfully.
  const selectedAcademyId = academyIdFromContext(selected);
  const current = useMemo<TeachingProfile>(
    () =>
      profiles.find((p) => p.value === selected) ??
      (selectedAcademyId && available === null
        ? { value: selected, kind: 'academy' as const, label: 'Academy profile', academyId: selectedAcademyId }
        : INDIVIDUAL_PROFILE),
    [profiles, selected, selectedAcademyId, available],
  );

  const switchTo = useCallback((value: TeachingContextValue) => {
    if (value === teachingContext.value) return;
    clearCachedFetch();
    teachingContext.set(value);
  }, []);

  const state = useMemo(
    () => ({ current, profiles, ready: available !== null, error, reload, switchTo }),
    [current, profiles, available, error, reload, switchTo],
  );

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}
