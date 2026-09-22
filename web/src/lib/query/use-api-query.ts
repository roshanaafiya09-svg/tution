'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type DependencyList,
} from 'react';
import { ApiError, isAbortError, toApiError } from '../api/errors';
import { teachingContext } from '../teaching-context';

/**
 * The four states a piece of server data can be in — and the type system
 * keeps them apart:
 *
 *   loading  no answer yet
 *   success  the API answered; `data` is the real response (which may be an
 *            empty list — that is "successful empty", decided by the UI, and
 *            only ever reachable from HERE)
 *   error    the API did NOT answer usefully; `error` says why
 *
 * There is deliberately no state in which a failure carries `[]`, `0` or
 * `null` as data: in the `error` branch `data` does not exist to be rendered.
 */
interface Actions<T> {
  /** Re-run the request. From `error` this returns to `loading`; from
   *  `success` it keeps showing the current data while `isRefreshing`. */
  reload: () => Promise<void>;
  /** Patch the loaded data locally (optimistic update after a mutation).
   *  A no-op unless the query is in `success`. */
  setData: (next: T | ((current: T) => T)) => void;
  isRefreshing: boolean;
}

export type QueryState<T> =
  | ({ status: 'loading'; data: null; error: null } & Actions<T>)
  | ({ status: 'success'; data: T; error: null } & Actions<T>)
  | ({ status: 'error'; data: null; error: ApiError } & Actions<T>);

type Core<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T; refreshing: boolean }
  | { status: 'error'; error: ApiError };

export interface UseApiQueryOptions {
  /** Hold the request until true (e.g. waiting on a route param). While
   *  held the query reports `loading`. Default true. */
  enabled?: boolean;
  /** Reload when the teaching profile (Individual / Academy) is switched.
   *  Default true — right for anything that is per-profile data. Turn off for
   *  identity-level data that is the same in every profile (the signed-in
   *  user's own record). */
  profileScoped?: boolean;
}

/**
 * Loads server data and reports it as one of the four honest states above.
 *
 *   const batches = useApiQuery(() => api.get<Batch[]>('/batches/me'), []);
 *
 * - Re-runs when `deps` change AND whenever the teaching profile (Individual
 *   / Academy) is switched, so a page can never keep showing the previous
 *   profile's data — the profile itself is attached to the request by the
 *   client, pages do nothing.
 * - Ignores responses that arrive after the query was superseded or unmounted.
 * - A loader that rejects becomes `status: 'error'`; it can never become data.
 * - Combine several requests in one loader with `Promise.all` — if ANY fails
 *   the whole query is `error` (no half-loaded page presenting missing data as
 *   empty). For independent widgets, use one query per widget.
 */
export function useApiQuery<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList = [],
  options: UseApiQueryOptions = {},
): QueryState<T> {
  const enabled = options.enabled ?? true;
  const profileScoped = options.profileScoped ?? true;
  const [core, setCore] = useState<Core<T>>({ status: 'loading' });
  const fetcherRef = useRef(fetcher);
  const sequence = useRef(0);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  // Switching teaching profile must reload everything that was loaded under
  // the old one.
  const profile = useSyncExternalStore(
    teachingContext.subscribe,
    () => teachingContext.value,
    () => 'individual',
  );

  const run = useCallback((mode: 'initial' | 'reload'): Promise<void> => {
    const id = ++sequence.current;
    setCore((previous) =>
      mode === 'reload' && previous.status === 'success'
        ? { ...previous, refreshing: true }
        : { status: 'loading' },
    );
    return fetcherRef.current().then(
      (data) => {
        if (id !== sequence.current) return;
        setCore({ status: 'success', data, refreshing: false });
      },
      (thrown: unknown) => {
        if (id !== sequence.current || isAbortError(thrown)) return;
        if (!(thrown instanceof ApiError)) {
          // Not a failed request — a bug in the page's own loader. Surface it
          // to developers; the user still gets an error state, never a blank.
          console.error('[query] loader threw a non-API error', thrown);
        }
        setCore({ status: 'error', error: toApiError(thrown) });
      },
    );
  }, []);

  useEffect(() => {
    if (!enabled) {
      setCore({ status: 'loading' });
      return;
    }
    void run('initial');
    return () => {
      // Invalidate any in-flight response for the previous deps/profile.
      sequence.current += 1;
    };
    // `deps` is the caller's dependency list by contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, profileScoped ? profile : null, enabled, run]);

  const reload = useCallback(() => run('reload'), [run]);

  const setData = useCallback((next: T | ((current: T) => T)) => {
    setCore((previous) =>
      previous.status === 'success'
        ? {
            ...previous,
            data:
              typeof next === 'function' ? (next as (current: T) => T)(previous.data) : next,
          }
        : previous,
    );
  }, []);

  const actions = {
    reload,
    setData,
    isRefreshing: core.status === 'success' && core.refreshing,
  };

  if (core.status === 'success') {
    return { status: 'success', data: core.data, error: null, ...actions };
  }
  if (core.status === 'error') {
    return { status: 'error', data: null, error: core.error, ...actions };
  }
  return { status: 'loading', data: null, error: null, ...actions };
}

type DataOf<Q> = Q extends QueryState<infer T> ? T : never;

/**
 * Joins independent queries into ONE page-level state: `error` if any failed
 * (with that query's error), else `loading` if any is still loading, else
 * `success` with every result. Use it when a page genuinely cannot render
 * without all of its sources; keep them separate (and give each widget its
 * own error state) when parts of the page stand alone.
 */
export function combineQueries<Q extends Record<string, QueryState<never>>>(
  queries: Q,
): QueryState<{ [K in keyof Q]: DataOf<Q[K]> }> {
  type Out = { [K in keyof Q]: DataOf<Q[K]> };
  const entries = Object.entries(queries) as Array<[string, QueryState<unknown>]>;

  const reload = async () => {
    const failed = entries.filter(([, query]) => query.status === 'error');
    await Promise.all((failed.length > 0 ? failed : entries).map(([, query]) => query.reload()));
  };
  const setData: Actions<Out>['setData'] = () => undefined;
  const isRefreshing = entries.some(([, query]) => query.isRefreshing);
  const actions = { reload, setData, isRefreshing };

  const failed = entries.find(([, query]) => query.status === 'error');
  if (failed) {
    return { status: 'error', data: null, error: failed[1].error as ApiError, ...actions };
  }
  if (entries.some(([, query]) => query.status === 'loading')) {
    return { status: 'loading', data: null, error: null, ...actions };
  }
  return {
    status: 'success',
    data: Object.fromEntries(entries.map(([key, query]) => [key, query.data])) as Out,
    error: null,
    ...actions,
  };
}
