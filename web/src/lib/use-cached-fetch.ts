'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Module-level, single-consumer-per-key cache: each dashboard mounts a
 * given key exactly once, so no pub/sub layer is needed here. Cleared
 * entirely on logout (see `clearCachedFetch` call in `apiLogout`) — this
 * app's logout is a client-side `router.replace`, not a full page reload,
 * so without this a second account signing in on the same tab would
 * briefly see the previous account's cached dashboard data.
 */
const cache = new Map<string, unknown>();

export function clearCachedFetch(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}

/**
 * Stale-while-revalidate for a whole page's data bundle: serves a cached
 * value synchronously on remount (no loading flash) while always firing a
 * background refetch, and falls back to a normal loading state on a cold
 * key. Intentionally simple — no request de-duping across components, no
 * TTL — this app's dashboards each own one key and mount it once.
 */
export function useCachedFetch<T>(key: string, fetcher: () => Promise<T>) {
  const cached = cache.has(key) ? (cache.get(key) as T) : null;
  const [data, setData] = useState<T | null>(cached);
  const [loading, setLoading] = useState(cached === null);
  const [error, setError] = useState(false);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const load = useCallback(() => {
    setError(false);
    if (!cache.has(key)) setLoading(true);
    return fetcherRef
      .current()
      .then((result) => {
        cache.set(key, result);
        setData(result);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [key]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading, error, reload: load };
}
