/**
 * What a failed API call looks like to the rest of the app.
 *
 * Every failure — no network, a timeout, or any HTTP error status — becomes
 * ONE `ApiError` with enough structure that UI code never has to guess:
 * `kind` says what went wrong (so "connection problem" is only ever shown
 * for an actual connection problem), `code` is the backend's machine-readable
 * identifier, and `requestId` is the id the server logged the request under.
 *
 * Nothing in this app converts an `ApiError` into `[]`, `0` or `null`.
 */

export type ApiErrorKind =
  /** fetch() rejected — offline, DNS, connection reset, blocked CORS. No response. */
  | 'network'
  /** No response within the time limit. */
  | 'timeout'
  | 'unauthenticated' // 401
  | 'forbidden' // 403
  | 'not_found' // 404
  | 'conflict' // 409
  | 'validation' // 400 / 422
  | 'rate_limited' // 429
  | 'payment_required' // 402
  | 'server' // 500
  | 'bad_gateway' // 502
  | 'unavailable' // 503
  | 'gateway_timeout' // 504
  | 'unknown';

export function kindForStatus(status: number): ApiErrorKind {
  switch (status) {
    case 400:
    case 422:
      return 'validation';
    case 401:
      return 'unauthenticated';
    case 402:
      return 'payment_required';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 429:
      return 'rate_limited';
    case 500:
      return 'server';
    case 502:
      return 'bad_gateway';
    case 503:
      return 'unavailable';
    case 504:
      return 'gateway_timeout';
    default:
      return status >= 500 ? 'server' : 'unknown';
  }
}

/** Failures worth retrying on their own: the request never got a real
 *  answer, or a gateway said the service is briefly unavailable. Notably
 *  NOT 500 (the server did answer — with a bug) and never 4xx. */
const TRANSIENT_KINDS: ReadonlySet<ApiErrorKind> = new Set([
  'network',
  'timeout',
  'bad_gateway',
  'unavailable',
  'gateway_timeout',
]);

export function isTransientKind(kind: ApiErrorKind): boolean {
  return TRANSIENT_KINDS.has(kind);
}

/** Codes the backend uses (mirrors backend/src/common/http/error-codes.ts). */
export const ErrorCodes = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
  TEACHING_CONTEXT_INVALID: 'TEACHING_CONTEXT_INVALID',
  TEACHING_CONTEXT_FORBIDDEN: 'TEACHING_CONTEXT_FORBIDDEN',
  TEACHING_CONTEXT_MISMATCH: 'TEACHING_CONTEXT_MISMATCH',
  INVALID_OTP: 'INVALID_OTP',
  ACADEMY_HOLIDAY: 'ACADEMY_HOLIDAY',
  // Synthesised client-side when there is no server response.
  NETWORK_ERROR: 'NETWORK_ERROR',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  CLIENT_ERROR: 'CLIENT_ERROR',
} as const;

export interface ApiErrorInit {
  status: number;
  kind?: ApiErrorKind;
  code?: string | null;
  /** Message already safe to show a person (server-provided, or synthesised). */
  message: string;
  requestId?: string | null;
  details?: string[];
  method?: string;
  path?: string;
  /** How many attempts were made before giving up (>1 means retries happened). */
  attempts?: number;
  retryAfterSeconds?: number | null;
  cause?: unknown;
  /** Whether the message came from the server (vs. synthesised here). */
  serverMessage?: boolean;
}

export class ApiError extends Error {
  /** HTTP status, or 0 when there was no response (network / timeout). */
  readonly status: number;
  readonly kind: ApiErrorKind;
  /** Backend machine-readable code (or a synthesised CLIENT code). */
  readonly code: string;
  /** Id the server logged this request under — quote it to trace a failure. */
  readonly requestId: string | null;
  readonly details: string[];
  readonly method: string | null;
  readonly path: string | null;
  readonly attempts: number;
  readonly retryAfterSeconds: number | null;
  /** True when `message` was written by the backend for this specific error. */
  readonly serverMessage: boolean;
  /** Only ever true when the sign-in flow is blocked pending a Telegram link
   *  (legacy — login-form branches on it instead of matching message text). */
  readonly telegramLinkRequired: boolean;

  constructor(init: ApiErrorInit, telegramLinkRequired = false) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.kind = init.kind ?? kindForStatus(init.status);
    this.code = init.code ?? ErrorCodes.CLIENT_ERROR;
    this.requestId = init.requestId ?? null;
    this.details = init.details ?? [];
    this.method = init.method ?? null;
    this.path = init.path ?? null;
    this.attempts = init.attempts ?? 1;
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
    this.serverMessage = init.serverMessage ?? false;
    this.telegramLinkRequired = telegramLinkRequired;
    if (init.cause !== undefined) this.cause = init.cause;
  }

  /** Transient by nature: safe (and useful) to retry automatically. */
  get transient(): boolean {
    return isTransientKind(this.kind);
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** True for a failure caused by cancelling the request ourselves
 *  (unmount, superseded query) — never something to show a user. */
export function isAbortError(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { name?: unknown }).name === 'AbortError'
  );
}

/**
 * Coerces anything thrown out of a data loader into an ApiError so the UI
 * only ever deals with one shape. A non-ApiError here is a bug in the page's
 * own loader (a bad `.then`, a null dereference) — it is deliberately NOT
 * labelled a connection problem.
 */
export function toApiError(value: unknown): ApiError {
  if (value instanceof ApiError) return value;
  return new ApiError({
    status: 0,
    kind: 'unknown',
    code: ErrorCodes.CLIENT_ERROR,
    message: 'Something unexpected went wrong while loading this page.',
    cause: value,
  });
}
