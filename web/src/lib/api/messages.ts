import { ApiError, ErrorCodes, toApiError, type ApiErrorKind } from './errors';

/**
 * The single place a failure becomes words. Pages never write their own
 * "Could not load X. Check your connection" — that string used to be shown
 * for EVERY failure, sending people hunting for a network problem when the
 * server had answered with a permissions error or a 500. "Connection" copy
 * is only produced for `kind === 'network'`.
 *
 * `what` is the noun phrase for what was being loaded ("your calendar");
 * it is woven into copy where that reads naturally.
 */
export interface ErrorDescription {
  title: string;
  message: string;
  kind: ApiErrorKind;
  code: string;
  status: number;
  requestId: string | null;
  /** Would trying the same request again plausibly help? Drives the Retry
   *  button: pointless for a 403/404, useful for a timeout or a 500. */
  canRetry: boolean;
}

interface Copy {
  title: string;
  message: (what: string | undefined, error: ApiError) => string;
  canRetry: boolean;
}

const loading = (what: string | undefined) => (what ? `loading ${what}` : 'loading this');

const BY_KIND: Record<ApiErrorKind, Copy> = {
  network: {
    title: "Can't reach the server",
    message: (what) =>
      `We couldn't connect${what ? ` to load ${what}` : ''}. Check your internet connection and try again.`,
    canRetry: true,
  },
  timeout: {
    title: 'The server took too long to respond',
    message: (what) =>
      `The request${what ? ` for ${what}` : ''} timed out. The server may be waking up — try again in a moment.`,
    canRetry: true,
  },
  unauthenticated: {
    title: 'Session expired',
    message: () => 'Your session has ended. Please sign in again to continue.',
    canRetry: false,
  },
  forbidden: {
    title: 'No access',
    message: (what) =>
      `Your account doesn't have permission to ${what ? `see ${what}` : 'do that'}.`,
    canRetry: false,
  },
  not_found: {
    title: 'Not found',
    message: (what) =>
      `We couldn't find ${what ?? 'what you were looking for'}. It may have been moved or removed.`,
    canRetry: false,
  },
  conflict: {
    title: 'Out of date',
    message: () => 'This changed while you were working. Refresh and try again.',
    canRetry: true,
  },
  validation: {
    title: 'Invalid request',
    message: () => 'Some of the information was not accepted. Check it and try again.',
    canRetry: false,
  },
  rate_limited: {
    title: 'Too many requests',
    message: (_what, error) =>
      error.retryAfterSeconds
        ? `You're going too fast. Try again in ${error.retryAfterSeconds} seconds.`
        : "You're going too fast. Wait a few seconds and try again.",
    canRetry: true,
  },
  payment_required: {
    title: 'Subscription required',
    message: () => 'This needs an active subscription.',
    canRetry: false,
  },
  server: {
    title: 'Something went wrong on our side',
    message: (what) =>
      `We hit a problem ${loading(what)}. It's been logged — try again in a moment.`,
    canRetry: true,
  },
  bad_gateway: {
    title: 'Service temporarily unavailable',
    message: () => "We couldn't reach our servers just now. Try again in a moment.",
    canRetry: true,
  },
  unavailable: {
    title: 'Service temporarily unavailable',
    message: () => 'Scholar is briefly unavailable — this usually clears within seconds. Try again.',
    canRetry: true,
  },
  gateway_timeout: {
    title: 'The server took too long to respond',
    message: () => 'The server timed out. Try again in a moment.',
    canRetry: true,
  },
  unknown: {
    title: 'Something went wrong',
    message: (what) => `We couldn't finish ${loading(what)}. Try again.`,
    canRetry: true,
  },
};

/** Titles for the Individual/Academy isolation errors — these are about
 *  which teaching profile is active, not about permissions in general. */
const BY_CODE: Record<string, { title: string; canRetry: boolean }> = {
  [ErrorCodes.TEACHING_CONTEXT_FORBIDDEN]: {
    title: 'Teaching profile not available',
    canRetry: false,
  },
  [ErrorCodes.TEACHING_CONTEXT_MISMATCH]: {
    title: 'Wrong teaching profile',
    canRetry: false,
  },
  [ErrorCodes.TEACHING_CONTEXT_INVALID]: {
    title: 'Teaching profile not recognised',
    canRetry: false,
  },
  // A 409, but not "out of date" — the date itself is closed; the server's
  // message names the holiday.
  [ErrorCodes.ACADEMY_HOLIDAY]: {
    title: 'Academy holiday',
    canRetry: false,
  },
};

/**
 * Codes whose server message is a stock sentence by construction (the backend
 * fills it in from the status) — for these the `what`-aware copy above reads
 * better. Every OTHER code means a thrower wrote a specific message for a
 * specific situation ("This batch is full", "This is an Academy batch. Switch
 * to that academy profile…", "Could not send the code by email") and that
 * message wins.
 */
const GENERIC_CODES = new Set<string>([
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'BAD_GATEWAY',
  'SERVICE_UNAVAILABLE',
  'GATEWAY_TIMEOUT',
  ErrorCodes.DEPENDENCY_UNAVAILABLE,
]);

export function describeApiError(
  error: unknown,
  options: { what?: string } = {},
): ErrorDescription {
  const err = toApiError(error);
  const copy = BY_KIND[err.kind];
  const byCode = BY_CODE[err.code];

  const useServerMessage =
    err.serverMessage &&
    err.message.length > 0 &&
    err.kind !== 'network' &&
    err.kind !== 'timeout' &&
    !GENERIC_CODES.has(err.code);

  return {
    title: byCode?.title ?? copy.title,
    message: useServerMessage ? err.message : copy.message(options.what, err),
    kind: err.kind,
    code: err.code,
    status: err.status,
    // A request that never reached the server has nothing to look up there.
    requestId: err.kind === 'network' ? null : err.requestId,
    canRetry: byCode ? byCode.canRetry : copy.canRetry,
  };
}

/**
 * One-line, user-safe text for a failed ACTION (save, delete, submit) shown
 * in a toast or under a form. Unlike loading errors this prefers the
 * server's specific message ("This batch is full") for any 4xx.
 */
export function errorMessage(error: unknown, fallback?: string): string {
  if (error instanceof ApiError) {
    if (error.serverMessage && error.kind !== 'unauthenticated' && error.status < 500) {
      return error.message;
    }
    return describeApiError(error).message;
  }
  return fallback ?? 'Something unexpected went wrong. Try again.';
}
