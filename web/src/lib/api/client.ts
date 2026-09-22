import { teachingContext } from '../teaching-context';
import { clearCachedFetch } from '../use-cached-fetch';
import { apiConfig } from './config';
import { ApiError, ErrorCodes, isAbortError } from './errors';
import { logApi, normalizePath, type ApiLogEntry } from './log';
import { raiseSessionLost, rearmSessionLost } from './session-events';

/**
 * THE api client. Every request the web app makes to the backend goes
 * through `execute()` below — pages never call `fetch` themselves — so the
 * behaviours that used to be re-invented (or forgotten) page by page happen
 * exactly once, identically, for every dashboard:
 *
 *  - a request id on every call (`X-Request-Id`), echoed by the backend and
 *    quoted in logs and error screens so a failure can be traced end to end
 *  - the selected teaching profile (Individual / Academy) attached as
 *    `X-Teaching-Context` — no page has to remember to
 *  - a timeout on every attempt
 *  - every failure normalised to ONE `ApiError` (network, timeout, 401, 403,
 *    404, 409, 422, 429, 500, 502, 503, 504…) with the backend's
 *    machine-readable `code` and `requestId` preserved
 *  - bounded automatic retry of TRANSIENT failures only (network, timeout,
 *    502/503/504) and only for idempotent GETs
 *  - 401 handled centrally: one silent session refresh, then a single
 *    "session lost" event that redirects to login — never a per-page check
 *  - structured logging of every failure
 *
 * What it never does: turn a failure into `[]`, `0` or `null`.
 */

function getApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    // No localhost fallback: an unset NEXT_PUBLIC_API_URL must fail loudly,
    // not silently point every request at the visitor's own machine (that
    // produced an opaque ERR_CONNECTION_REFUSED on the live site).
    throw new Error(
      'NEXT_PUBLIC_API_URL is not set. Configure it in your environment (see web/.env.example) or in the Vercel project settings.',
    );
  }
  return url;
}

// ---------------------------------------------------------------------------
// Session (SEC-02): the refresh token lives only in an httpOnly cookie the
// backend sets; this module never sees it, it only sends `credentials:
// 'include'`. The access token stays in memory (a reload loses it, which is
// why `ensureSession()` re-derives one from the cookie on load).
//
// The `X-Auth-Client: web` header selects the cookie-based path on the
// backend; mobile never sends it and is unaffected.
// ---------------------------------------------------------------------------

let accessToken: string | null = null;
let csrfToken: string | null = null;
/** True while the token in memory is a Super Admin "view as user" token,
 *  which has no refresh token of its own (see lib/impersonation.ts). */
let impersonationToken = false;

export const session = {
  get access() {
    return accessToken;
  },
  set(newAccessToken: string, newCsrfToken: string) {
    accessToken = newAccessToken;
    csrfToken = newCsrfToken;
    impersonationToken = false;
    rearmSessionLost();
  },
  /** Impersonation tokens have no matching refresh token/cookie by design —
   *  this makes that the active session while deliberately leaving csrfToken
   *  untouched, since impersonation never rotates the admin's refresh cookie. */
  setAccessOnly(newAccessToken: string) {
    accessToken = newAccessToken;
    impersonationToken = true;
    rearmSessionLost();
  },
  clear() {
    accessToken = null;
    csrfToken = null;
    impersonationToken = false;
  },
};

const AUTH_HEADERS = { 'X-Auth-Client': 'web' } as const;

function newRequestId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // Non-secure context fallback — the id only needs to be unique, not secret.
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// ---------------------------------------------------------------------------
// Failure construction
// ---------------------------------------------------------------------------

interface Envelope {
  code?: unknown;
  message?: unknown;
  requestId?: unknown;
  details?: unknown;
  telegramLinkRequired?: unknown;
}

/** Copy for a failure that produced no usable server message (network,
 *  timeout, an HTML error page from a proxy…). Server-written messages are
 *  used when present; describeApiError() layers friendlier copy on top. */
const FALLBACK_MESSAGE: Record<string, string> = {
  network: "We couldn't reach the server. Check your internet connection and try again.",
  timeout: 'The request timed out. Try again in a moment.',
  default: 'Something went wrong. Try again.',
};

function parseRetryAfter(res: Response): number | null {
  const raw = res.headers.get('retry-after');
  if (!raw) return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

async function errorFromResponse(
  res: Response,
  meta: { method: string; path: string; requestId: string; attempt: number },
): Promise<ApiError> {
  let envelope: Envelope | null = null;
  try {
    const text = await res.text();
    const parsed: unknown = text ? JSON.parse(text) : null;
    if (typeof parsed === 'object' && parsed !== null) envelope = parsed as Envelope;
  } catch {
    // Not JSON — a proxy/CDN error page (Render/Vercel 502/503 are HTML).
  }

  const serverMessage =
    typeof envelope?.message === 'string' && envelope.message.length > 0
      ? envelope.message
      : Array.isArray(envelope?.message)
        ? envelope.message.map(String).join(', ')
        : null;

  return new ApiError(
    {
      status: res.status,
      code: typeof envelope?.code === 'string' ? envelope.code : defaultCode(res.status),
      message: serverMessage ?? FALLBACK_MESSAGE.default,
      serverMessage: serverMessage !== null,
      // Prefer the id the server actually logged; fall back to the one we sent
      // (the server logs the client's id when it is well-formed).
      requestId:
        (typeof envelope?.requestId === 'string' ? envelope.requestId : null) ??
        res.headers.get('x-request-id') ??
        meta.requestId,
      details: Array.isArray(envelope?.details) ? envelope.details.map(String) : [],
      method: meta.method,
      path: normalizePath(meta.path),
      attempts: meta.attempt,
      retryAfterSeconds: parseRetryAfter(res),
    },
    envelope?.telegramLinkRequired === true,
  );
}

function defaultCode(status: number): string {
  return status === 401 ? ErrorCodes.UNAUTHENTICATED : `HTTP_${status}`;
}

function networkError(
  cause: unknown,
  meta: { method: string; path: string; requestId: string; attempt: number },
): ApiError {
  return new ApiError({
    status: 0,
    kind: 'network',
    code: ErrorCodes.NETWORK_ERROR,
    message: FALLBACK_MESSAGE.network,
    requestId: meta.requestId,
    method: meta.method,
    path: normalizePath(meta.path),
    attempts: meta.attempt,
    cause,
  });
}

function timeoutError(
  meta: { method: string; path: string; requestId: string; attempt: number },
): ApiError {
  return new ApiError({
    status: 0,
    kind: 'timeout',
    code: ErrorCodes.REQUEST_TIMEOUT,
    message: FALLBACK_MESSAGE.timeout,
    requestId: meta.requestId,
    method: meta.method,
    path: normalizePath(meta.path),
    attempts: meta.attempt,
  });
}

// ---------------------------------------------------------------------------
// One request, with retry / refresh / logging
// ---------------------------------------------------------------------------

interface RequestSpec {
  method: string;
  path: string;
  body?: unknown;
  /** Attach the bearer token and run 401 refresh handling. Default true. */
  auth?: boolean;
  /** Attach X-Teaching-Context. Default true (only meaningful when authed). */
  context?: boolean;
  /** Automatically retry transient failures. Default false. */
  retry?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  responseType?: 'json' | 'blob';
  /** Extra headers (e.g. storage upload headers). */
  headers?: Record<string, string>;
  /** Absolute URL instead of an API path (storage uploads). */
  absoluteUrl?: string;
  /** Raw body (File/Blob) instead of JSON. */
  rawBody?: BodyInit;
}

type Attempt<T> =
  | { ok: true; value: T; tokenUsed: string | null }
  | { ok: false; error: ApiError; tokenUsed: string | null };

async function attemptOnce<T>(
  spec: RequestSpec,
  requestId: string,
  attempt: number,
): Promise<Attempt<T>> {
  const meta = { method: spec.method, path: spec.path, requestId, attempt };
  const authed = spec.auth !== false;
  const tokenUsed = authed ? accessToken : null;

  // Storage uploads carry ONLY the headers the presigned URL was signed for
  // — extra headers would break the signature (or trip CORS preflight).
  const headers: Record<string, string> = spec.absoluteUrl
    ? { ...(spec.headers ?? {}) }
    : { ...AUTH_HEADERS, ...(spec.headers ?? {}), 'X-Request-Id': requestId };
  if (!spec.absoluteUrl) {
    if (authed && spec.context !== false) headers['X-Teaching-Context'] = teachingContext.value;
    if (spec.body !== undefined) headers['Content-Type'] = 'application/json';
    if (tokenUsed) headers.Authorization = `Bearer ${tokenUsed}`;
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, spec.timeoutMs ?? apiConfig.timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (spec.signal) {
    if (spec.signal.aborted) controller.abort();
    else spec.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const res = await apiConfig.fetch(spec.absoluteUrl ?? `${getApiUrl()}${spec.path}`, {
      method: spec.method,
      headers,
      credentials: spec.absoluteUrl ? 'omit' : 'include',
      body:
        spec.rawBody !== undefined
          ? spec.rawBody
          : spec.body === undefined
            ? undefined
            : JSON.stringify(spec.body),
      signal: controller.signal,
    });

    if (!res.ok) {
      return { ok: false, error: await errorFromResponse(res, meta), tokenUsed };
    }
    if (spec.responseType === 'blob') {
      return { ok: true, value: (await res.blob()) as T, tokenUsed };
    }
    if (res.status === 204) return { ok: true, value: undefined as T, tokenUsed };

    // A Nest handler returning `undefined` (a "may not exist yet" GET like a
    // not-yet-created profile) sends an empty 200 body, not JSON `null` —
    // parse manually and treat an empty body as null.
    const text = await res.text();
    if (text === '') return { ok: true, value: null as T, tokenUsed };
    try {
      return { ok: true, value: JSON.parse(text) as T, tokenUsed };
    } catch (cause) {
      return {
        ok: false,
        tokenUsed,
        error: new ApiError({
          status: res.status,
          kind: 'unknown',
          code: ErrorCodes.INVALID_RESPONSE,
          message: 'The server sent a response we could not read.',
          requestId,
          method: spec.method,
          path: normalizePath(spec.path),
          attempts: attempt,
          cause,
        }),
      };
    }
  } catch (cause) {
    if (timedOut) return { ok: false, error: timeoutError(meta), tokenUsed };
    // Cancelled by the caller (unmount / superseded) — not a failure to report.
    if (spec.signal?.aborted || isAbortError(cause)) throw cause;
    // fetch() only rejects on network failure (offline, reset, CORS
    // preflight lost to a cold start) — never on an HTTP error status.
    return { ok: false, error: networkError(cause, meta), tokenUsed };
  } finally {
    clearTimeout(timer);
    spec.signal?.removeEventListener('abort', onExternalAbort);
  }
}

function logFailure(
  spec: RequestSpec,
  error: ApiError,
  attempt: number,
  startedAt: number,
  final: boolean,
  event: ApiLogEntry['event'] = final ? 'api_failure' : 'api_retry',
): void {
  logApi({
    event,
    level: !final ? 'info' : error.status >= 500 ? 'error' : 'warn',
    requestId: error.requestId,
    method: spec.method,
    path: normalizePath(spec.path),
    status: error.status,
    code: error.code,
    kind: error.kind,
    attempt,
    durationMs: Date.now() - startedAt,
    teachingContext: teachingContext.value,
    message: error.message,
    final,
  });
}

async function execute<T>(spec: RequestSpec): Promise<T> {
  const requestId = newRequestId();
  const startedAt = Date.now();
  const maxAttempts = spec.retry ? 1 + apiConfig.retryDelaysMs.length : 1;
  let attempt = 0;
  let refreshTried = false;

  for (;;) {
    attempt += 1;
    const result = await attemptOnce<T>(spec, requestId, attempt);
    if (result.ok) return result.value;
    const error = result.error;

    // --- 401: handled here, once, for every page -------------------------
    if (
      error.kind === 'unauthenticated' &&
      spec.auth !== false &&
      error.code !== ErrorCodes.INVALID_OTP
    ) {
      if (!refreshTried && !impersonationToken) {
        refreshTried = true;
        // Another request may already have refreshed while this one was in
        // flight: then there is nothing to refresh, just retry with the new token.
        if (accessToken && accessToken !== result.tokenUsed) {
          attempt -= 1;
          continue;
        }
        // Throws a transient ApiError if the refresh call itself failed for a
        // non-auth reason (server down): the session may well still be valid,
        // so the user gets a "try again" error — NOT a logout.
        if ((await refreshSession()) === 'ok') {
          attempt -= 1;
          continue;
        }
      }
      logFailure(spec, error, attempt, startedAt, true, 'api_session_lost');
      handleSessionLost();
      throw error;
    }

    // --- transient failure: bounded automatic retry ----------------------
    if (error.transient && attempt < maxAttempts) {
      logFailure(spec, error, attempt, startedAt, false);
      await apiConfig.sleep(apiConfig.retryDelaysMs[attempt - 1]);
      continue;
    }

    logFailure(spec, error, attempt, startedAt, true);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Session refresh / loss
// ---------------------------------------------------------------------------

type RefreshOutcome = 'ok' | 'invalid';
let refreshInFlight: Promise<RefreshOutcome> | null = null;

/**
 * Exchanges the httpOnly refresh cookie for a new access token — shared by
 * every caller so a dashboard's burst of simultaneous 401s triggers exactly
 * ONE refresh (a second concurrent call would try a just-rotated token and
 * wrongly sign the user out).
 *
 *  'ok'      new access token installed
 *  'invalid' the server said there is no valid session (401/403)
 *  throws    the refresh could not be completed (network, 5xx, timeout): the
 *            session's validity is UNKNOWN, so this must not log the user out
 */
function refreshSession(): Promise<RefreshOutcome> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function doRefresh(): Promise<RefreshOutcome> {
  const requestId = newRequestId();
  const result = await attemptOnce<{ accessToken: string; csrfToken: string }>(
    {
      method: 'POST',
      path: '/auth/refresh',
      body: {},
      auth: false,
      context: false,
    },
    requestId,
    1,
  );
  if (result.ok) {
    session.set(result.value.accessToken, result.value.csrfToken);
    return 'ok';
  }
  if (result.error.status === 400 || result.error.status === 401 || result.error.status === 403) {
    session.clear();
    return 'invalid';
  }
  throw result.error;
}

let ensureSessionPromise: Promise<boolean> | null = null;

/** Re-derives the in-memory access token from the httpOnly refresh cookie on
 *  page load, memoized so several shells/components mounting at once trigger
 *  one /auth/refresh call.
 *
 *  Resolves `true` (signed in) or `false` (definitely no valid session —
 *  redirect to login). REJECTS with an ApiError when the backend could not be
 *  reached, because "server is down" must not look like "you are signed out". */
export function ensureSession(): Promise<boolean> {
  if (accessToken) return Promise.resolve(true);
  if (!ensureSessionPromise) {
    ensureSessionPromise = refreshSession()
      .then((outcome) => outcome === 'ok')
      .finally(() => {
        ensureSessionPromise = null;
      });
  }
  return ensureSessionPromise;
}

/**
 * For page/shell bootstrap: resolves once a session exists, otherwise raises
 * the central "session lost" redirect and rejects with a 401 ApiError (so a
 * loader that awaits this simply ends in the error branch while the redirect
 * happens). A backend that cannot be reached rejects with that transient
 * error instead — "server down" is never treated as "signed out".
 */
export async function requireSession(): Promise<void> {
  if (await ensureSession()) return;
  handleSessionLost();
  throw new ApiError({
    status: 401,
    kind: 'unauthenticated',
    code: ErrorCodes.UNAUTHENTICATED,
    message: 'Your session has ended. Please sign in again to continue.',
  });
}

function handleSessionLost(): void {
  session.clear();
  clearCachedFetch();
  teachingContext.reset();
  raiseSessionLost();
}

// ---------------------------------------------------------------------------
// GET de-duplication + reference-data cache
// ---------------------------------------------------------------------------

/**
 * Identical GETs issued while one is already in flight share that one
 * request — the shell and the page both asking for /auth/me on mount, or
 * several tiles asking for /catalog/subjects, cost one round trip.
 * /catalog/* is platform reference data (subjects, curricula, grades) that
 * almost every page loads and that changes only on a deploy, so it is
 * additionally kept for a few minutes across page navigations. Only
 * SUCCESSES are ever cached.
 */
const inflightGets = new Map<string, Promise<unknown>>();
const STATIC_GET_TTL_MS = 10 * 60 * 1000;
const staticGetCache = new Map<string, { at: number; value: unknown }>();

function isStaticPath(path: string): boolean {
  return path.startsWith('/catalog/');
}

function cachedStatic<T>(path: string): T | undefined {
  const hit = staticGetCache.get(path);
  if (hit && Date.now() - hit.at < STATIC_GET_TTL_MS) return hit.value as T;
  return undefined;
}

function dedupedGet<T>(path: string, scope: string, run: () => Promise<T>): Promise<T> {
  if (isStaticPath(path)) {
    const hit = cachedStatic<T>(path);
    if (hit !== undefined) return Promise.resolve(hit);
  }
  // Keyed by profile too: the same URL in two teaching contexts is two
  // different requests and must never share one response.
  const key = `${scope}|${path}`;
  const existing = inflightGets.get(key);
  if (existing) return existing as Promise<T>;
  const pending = run()
    .then((value) => {
      if (isStaticPath(path)) staticGetCache.set(path, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflightGets.delete(key));
  inflightGets.set(key, pending);
  return pending;
}

/** Drops cached reference data and in-flight sharing — used by tests and by sign-out. */
export function resetApiCaches(): void {
  inflightGets.clear();
  staticGetCache.clear();
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface GetOptions {
  /** Cancel the request (a superseded query, an unmounted page). */
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Set false to opt a GET out of automatic transient retry. */
  retry?: boolean;
}

export interface MutationOptions {
  timeoutMs?: number;
  /** Opt an IDEMPOTENT mutation into automatic transient retry. Off by
   *  default: a POST that timed out may still have been applied. */
  retry?: boolean;
}

export const api = {
  get: <T>(path: string, options: GetOptions = {}): Promise<T> => {
    const run = () =>
      execute<T>({
        method: 'GET',
        path,
        retry: options.retry ?? true,
        timeoutMs: options.timeoutMs,
        signal: options.signal,
      });
    // A caller-supplied signal is per-caller, so it cannot share a request.
    return options.signal ? run() : dedupedGet<T>(path, teachingContext.value, run);
  },
  post: <T>(path: string, body?: unknown, options: MutationOptions = {}) =>
    execute<T>({ method: 'POST', path, body, ...options }),
  put: <T>(path: string, body?: unknown, options: MutationOptions = {}) =>
    execute<T>({ method: 'PUT', path, body, ...options }),
  patch: <T>(path: string, body?: unknown, options: MutationOptions = {}) =>
    execute<T>({ method: 'PATCH', path, body, ...options }),
  delete: <T>(path: string, options: MutationOptions = {}) =>
    execute<T>({ method: 'DELETE', path, ...options }),
  /** Authenticated binary GET (e.g. the offline scorecard .xlsx template). A
   *  raw `fetch` to an API path carries no Bearer token — it lives only in
   *  this module's memory — so downloads must come through here. */
  download: (path: string) =>
    execute<Blob>({ method: 'GET', path, retry: true, responseType: 'blob' }),
  /** PUT a file to a presigned/dev storage URL. Not an API call (no bearer
   *  token, no context header), but it fails the same way and should read the
   *  same: a network drop is a network error, a 403 is a 403. */
  upload: (
    url: string,
    headers: Record<string, string>,
    file: Blob,
  ): Promise<void> =>
    execute<void>({
      method: 'PUT',
      path: new URL(url, 'http://storage.invalid').pathname,
      absoluteUrl: url,
      auth: false,
      context: false,
      headers,
      rawBody: file,
      timeoutMs: 120_000,
    }),
};

/** Revokes the session server-side (refresh token, whether cookie- or
 *  body-borne) and clears the in-memory access/CSRF tokens. Best-effort: the
 *  caller is signed out locally regardless of whether the call succeeds. */
export async function apiLogout(): Promise<void> {
  try {
    await apiConfig.fetch(`${getApiUrl()}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...AUTH_HEADERS,
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
      body: '{}',
    });
  } catch {
    // Unreachable backend — still sign out locally below.
  } finally {
    session.clear();
    teachingContext.reset();
    // Logout here is a client-side redirect, not a full page reload, so the
    // module-level dashboard cache would otherwise leak this user's data
    // into the next login in the same tab.
    clearCachedFetch();
    resetApiCaches();
  }
}

/** Unauthenticated POST — the login flow, before a session exists. Also
 *  carries `credentials: 'include'` because /auth/otp/verify, /auth/google
 *  and /dev/auto-login (the session-starting endpoints) need the browser to
 *  accept the Set-Cookie response. A 401 here (wrong code) is a normal error
 *  the form shows — it never triggers session-loss handling. */
export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return execute<T>({ method: 'POST', path, body, auth: false, context: false });
}

/** Unauthenticated GET — public pages and the login flow. */
export function apiGetPublic<T>(path: string): Promise<T> {
  return dedupedGet<T>(path, 'public', () =>
    execute<T>({ method: 'GET', path, auth: false, context: false, retry: true }),
  );
}

let warmedUp = false;

/** Fire-and-forget wake-up ping for a sleeping backend — see ApiWarmup.
 *  A plain credential-less CORS GET: `no-cors` would be blocked (and logged
 *  as a console error) by the backend's same-origin CORP header. Failure is
 *  irrelevant by design — it exists only to wake the server. */
export function warmUpApi(): void {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (warmedUp || !url) return;
  warmedUp = true;
  apiConfig.fetch(`${url}/health`).catch(() => undefined);
}

export function formatMinor(minor: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

