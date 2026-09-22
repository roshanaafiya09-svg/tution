import * as Sentry from '@sentry/nextjs';
import posthog from 'posthog-js';

/**
 * Structured logging for failed API calls.
 *
 * Every failure produces ONE entry carrying what a developer needs to trace
 * it end to end: the requestId (the same id the backend logged the request
 * under — search the server logs for it), method, normalised path, status,
 * machine-readable code, how many attempts were made, how long it took, and
 * which teaching profile the request was made in. Query strings are never
 * logged (they can carry tokens or personal data).
 */
export interface ApiLogEntry {
  event: 'api_failure' | 'api_retry' | 'api_session_lost';
  level: 'info' | 'warn' | 'error';
  requestId: string | null;
  method: string;
  path: string;
  status: number;
  code: string;
  kind: string;
  attempt: number;
  durationMs: number;
  teachingContext: string;
  message: string;
  /** Set on the final failure of a call (after any retries). */
  final: boolean;
}

export type ApiLogger = (entry: ApiLogEntry) => void;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** `/batches/3f2…/students?x=1` → `/batches/:id/students` — groups the same
 *  route together in Sentry/PostHog and keeps ids and query data out. */
export function normalizePath(path: string): string {
  return path
    .split('?')[0]
    .replace(UUID, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:n');
}

function defaultLogger(entry: ApiLogEntry): void {
  const line = { ...entry };
  if (entry.level === 'error') console.error('[api]', line);
  else if (entry.level === 'warn') console.warn('[api]', line);
  else if (process.env.NODE_ENV !== 'production') console.debug('[api]', line);

  if (entry.event === 'api_retry') return;

  Sentry.addBreadcrumb({
    category: 'api',
    level: entry.level === 'error' ? 'error' : 'warning',
    message: `${entry.method} ${entry.path} → ${entry.status || entry.kind}`,
    data: { requestId: entry.requestId, code: entry.code, attempt: entry.attempt },
  });

  if (entry.final && entry.level === 'error' && entry.status >= 500) {
    // Server-side failures are ours to fix. Network drops (status 0) are the
    // user's connection and would only be noise.
    Sentry.withScope((scope) => {
      if (entry.requestId) scope.setTag('request_id', entry.requestId);
      scope.setTag('api_code', entry.code);
      scope.setTag('api_status', String(entry.status));
      scope.setTag('teaching_context', entry.teachingContext);
      scope.setFingerprint(['api-failure', entry.method, entry.path, String(entry.status)]);
      Sentry.captureMessage(`API ${entry.status} ${entry.method} ${entry.path}`, 'error');
    });
  }

  if (entry.final && posthog.__loaded) {
    posthog.capture('api_error', {
      status: entry.status,
      code: entry.code,
      kind: entry.kind,
      method: entry.method,
      path: entry.path,
      request_id: entry.requestId,
    });
  }
}

let logger: ApiLogger = defaultLogger;

/** Test hook — pass `null` to restore the default. */
export function setApiLogger(next: ApiLogger | null): void {
  logger = next ?? defaultLogger;
}

export function logApi(entry: ApiLogEntry): void {
  try {
    logger(entry);
  } catch {
    // Logging must never be the reason a request fails.
  }
}
