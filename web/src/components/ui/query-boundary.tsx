'use client';

import type { ReactNode } from 'react';
import type { QueryState } from '@/lib/query/use-api-query';
import { ErrorState } from './error-state';
import { PageLoading } from './loading';

/**
 * Renders a query's four states, and is the ONLY place "empty" can be
 * decided: `empty` is consulted solely in the `success` branch, i.e. after
 * the API returned a real response. A failed request renders `ErrorState`
 * and can never fall through to the empty UI or to `children` with fake data.
 */
export function QueryBoundary<T>({
  query,
  what,
  loading = <PageLoading />,
  isEmpty,
  empty,
  compact = false,
  errorClassName,
  children,
}: {
  query: QueryState<T>;
  /** What is being loaded, for the error copy ("your calendar"). */
  what?: string;
  loading?: ReactNode;
  /** Decides "successful but nothing there". Default: an empty array, or null. */
  isEmpty?: (data: T) => boolean;
  /** Shown for a successful response with zero records. Omit to always render `children`. */
  empty?: ReactNode;
  /** Use the one-line inline error (for a single widget rather than a page). */
  compact?: boolean;
  errorClassName?: string;
  children: (data: T) => ReactNode;
}) {
  if (query.status === 'loading') return <>{loading}</>;

  if (query.status === 'error') {
    return (
      <ErrorState
        error={query.error}
        what={what}
        compact={compact}
        className={errorClassName}
        onRetry={() => void query.reload()}
      />
    );
  }

  const data = query.data;
  if (empty !== undefined) {
    const nothingThere = isEmpty
      ? isEmpty(data)
      : data === null || (Array.isArray(data) && data.length === 0);
    if (nothingThere) return <>{empty}</>;
  }
  return <>{children(data)}</>;
}
