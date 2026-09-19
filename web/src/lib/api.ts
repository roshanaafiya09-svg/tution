import * as Sentry from '@sentry/nextjs';
import posthog from 'posthog-js';
import { clearCachedFetch } from './use-cached-fetch';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * No localhost fallback: an unset NEXT_PUBLIC_API_URL must fail loudly
 * with a clear message, not silently point every request at the
 * visitor's own machine (that produced an opaque ERR_CONNECTION_REFUSED
 * on the live site — see handover.md §5).
 */
function getApiUrl(): string {
  if (!API_URL) {
    throw new Error(
      'NEXT_PUBLIC_API_URL is not set. Configure it in your environment (see web/.env.example) or in the Vercel project settings.',
    );
  }
  return API_URL;
}

/**
 * Auth transport (SEC-02): the refresh token used to live in
 * localStorage alongside the access token — readable by any XSS on the
 * page. It now lives only in an httpOnly cookie the backend sets on
 * /auth/otp/verify, /auth/google, and /auth/refresh (see
 * backend/src/modules/identity/auth/web-session.util.ts) — this module
 * never sees its value, only sends `credentials: 'include'` so the
 * browser attaches it. The access token stays in memory only (a page
 * reload loses it, which is why `ensureSession()` exists below to
 * silently re-derive one from the cookie on load) — never localStorage,
 * never a JS-readable cookie.
 *
 * The `X-Auth-Client: web` header on every call tells the backend to
 * take this cookie-based path instead of the legacy body-in/body-out
 * `refreshToken` shape mobile still uses — mobile never sends this
 * header and is completely unaffected by any of this.
 */
let accessToken: string | null = null;
let csrfToken: string | null = null;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** Set by the backend when OTP delivery is blocked because the
     *  account has no Telegram chat linked yet — the login form branches
     *  on this rather than string-matching the message. */
    public readonly telegramLinkRequired = false,
  ) {
    super(message);
  }
}

export const session = {
  get access() {
    return accessToken;
  },
  set(newAccessToken: string, newCsrfToken: string) {
    accessToken = newAccessToken;
    csrfToken = newCsrfToken;
  },
  /** Impersonation tokens (see lib/impersonation.ts) have no matching
   *  refresh token/cookie by design — this makes that the active session
   *  while deliberately leaving csrfToken untouched, since impersonation
   *  never rotates or otherwise uses the admin's own refresh cookie. */
  setAccessOnly(newAccessToken: string) {
    accessToken = newAccessToken;
  },
  clear() {
    accessToken = null;
    csrfToken = null;
  },
};

const AUTH_HEADERS = { 'X-Auth-Client': 'web' } as const;

let ensureSessionPromise: Promise<boolean> | null = null;

/** Re-derives the in-memory access token from the httpOnly refresh
 *  cookie on page load (or after any 401), memoized so several shells/
 *  components mounting at once trigger exactly one /auth/refresh call
 *  rather than a stampede. Returns false (no throw) when there's no
 *  valid session — callers redirect to /login on false. */
export function ensureSession(): Promise<boolean> {
  if (accessToken) return Promise.resolve(true);
  if (!ensureSessionPromise) {
    ensureSessionPromise = refreshTokens().finally(() => {
      ensureSessionPromise = null;
    });
  }
  return ensureSessionPromise;
}

async function parseError(res: Response): Promise<never> {
  const data: unknown = await res.json().catch(() => ({}));
  const message =
    typeof data === 'object' && data !== null && 'message' in data
      ? String((data as { message: unknown }).message)
      : 'Something went wrong. Try again.';
  const telegramLinkRequired =
    typeof data === 'object' &&
    data !== null &&
    (data as { telegramLinkRequired?: unknown }).telegramLinkRequired === true;
  const error = new ApiError(message, res.status, telegramLinkRequired);

  // Single choke point every api.get/post/put/delete call funnels
  // through — captures every API failure without per-call-site wiring.
  Sentry.addBreadcrumb({
    category: 'api',
    message: `${res.status} ${res.url}`,
    level: 'error',
  });
  if (posthog.__loaded) {
    posthog.capture('api_error', { status: res.status, url: res.url });
  }

  throw error;
}

/**
 * Access tokens live 15 minutes, so a single silent refresh-and-retry on
 * 401 keeps a working session from bouncing the user to the login page
 * mid-task. A failed refresh clears the in-memory session — the caller
 * sees the 401 (or, via ensureSession(), a `false`).
 */
async function refreshTokens(): Promise<boolean> {
  const res = await fetch(`${getApiUrl()}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
    body: '{}',
  });

  if (!res.ok) {
    session.clear();
    return false;
  }

  const tokens = (await res.json()) as { accessToken: string; csrfToken: string };
  session.set(tokens.accessToken, tokens.csrfToken);
  return true;
}

/**
 * Transient-failure retry for idempotent GETs only. The production
 * backend runs on Render's free plan, which sleeps when idle and briefly
 * answers 502/503 (or drops the connection) while waking or redeploying —
 * without this, one such blip among a page's parallel loads failed the
 * whole page with "Something went wrong". Mutations are never retried:
 * a POST that timed out may still have been applied.
 */
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const RETRY_DELAYS_MS = [500, 1500];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, init: RequestInit, retry: boolean): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const canRetry = retry && attempt < RETRY_DELAYS_MS.length;
    try {
      const res = await fetch(url, init);
      if (!canRetry || !RETRYABLE_STATUS.has(res.status)) return res;
    } catch (err) {
      // fetch() only rejects on network failure (offline, reset, CORS
      // preflight lost to a cold start) — never on an HTTP error status.
      if (!canRetry) throw err;
    }
    await sleep(RETRY_DELAYS_MS[attempt]);
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  retryOn401 = true,
): Promise<T> {
  const headers: Record<string, string> = { ...AUTH_HEADERS };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetchWithRetry(
    `${getApiUrl()}${path}`,
    {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    method === 'GET',
  );

  if (res.status === 401 && retryOn401 && (await refreshTokens())) {
    return request<T>(method, path, body, false);
  }

  if (!res.ok) return parseError(res);
  if (res.status === 204) return undefined as T;

  // A Nest handler returning `undefined` (e.g. a "may not exist yet" GET
  // like a not-yet-created profile/location) sends an empty 200 body, not
  // JSON `null` — res.json() throws on that, so parse manually and treat
  // an empty body as null instead.
  const text = await res.text();
  return (text === '' ? null : JSON.parse(text)) as T;
}

/** Authenticated binary GET (e.g. the offline scorecard .xlsx template).
 *  A raw `fetch` to an API path carries no Bearer token — the access token
 *  lives only in this module's memory — so it is always rejected with 401;
 *  binary downloads must go through here to get the same Authorization
 *  header and silent 401 refresh-and-retry as every JSON call. */
async function requestBlob(path: string, retryOn401 = true): Promise<Blob> {
  const headers: Record<string, string> = { ...AUTH_HEADERS };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetchWithRetry(
    `${getApiUrl()}${path}`,
    { method: 'GET', headers, credentials: 'include' },
    true,
  );

  if (res.status === 401 && retryOn401 && (await refreshTokens())) {
    return requestBlob(path, false);
  }
  if (!res.ok) return parseError(res);
  return res.blob();
}

/**
 * Identical GETs issued while one is already in flight share that one
 * request — the shell and the page both asking for /auth/me on mount, or
 * several tiles asking for /catalog/subjects, cost one round trip.
 * /catalog/* is platform reference data (subjects, curricula, grades)
 * that almost every page loads and that changes only on a deploy, so it
 * is additionally kept for a few minutes across page navigations.
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

function dedupedGet<T>(path: string, run: () => Promise<T>): Promise<T> {
  if (isStaticPath(path)) {
    const hit = cachedStatic<T>(path);
    if (hit !== undefined) return Promise.resolve(hit);
  }
  const existing = inflightGets.get(path);
  if (existing) return existing as Promise<T>;
  const pending = run()
    .then((value) => {
      if (isStaticPath(path)) staticGetCache.set(path, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflightGets.delete(path));
  inflightGets.set(path, pending);
  return pending;
}

let warmedUp = false;

/** Fire-and-forget wake-up ping for a sleeping backend — see ApiWarmup.
 *  A plain credential-less CORS GET: `no-cors` would be blocked (and
 *  logged as a console error) by the backend's same-origin
 *  Cross-Origin-Resource-Policy header. */
export function warmUpApi(): void {
  if (warmedUp || !API_URL) return;
  warmedUp = true;
  fetch(`${API_URL}/health`).catch(() => undefined);
}

export const api = {
  get: <T>(path: string) => dedupedGet<T>(path, () => request<T>('GET', path)),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  download: (path: string) => requestBlob(path),
};

/** Revokes the session server-side (refresh token, whether cookie- or
 *  body-borne) and clears the in-memory access/CSRF tokens. Best-effort
 *  like the old logout: the caller is signed out locally regardless of
 *  whether the network call itself succeeds. */
export async function apiLogout(): Promise<void> {
  try {
    await fetch(`${getApiUrl()}/auth/logout`, {
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
    // Logout here is a client-side redirect, not a full page reload, so
    // the module-level dashboard cache would otherwise leak this user's
    // data into the next login in the same tab.
    clearCachedFetch();
  }
}

/** Unauthenticated — used by the login page before a session exists.
 *  Also carries `credentials: 'include'` because /auth/otp/verify,
 *  /auth/google, and /dev/auto-login (the session-starting endpoints)
 *  are called through this helper too, and need the browser to accept
 *  the Set-Cookie response. */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${getApiUrl()}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
    body: JSON.stringify(body),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as T;
}

/** Unauthenticated GET — used by the login flow's Telegram-link polling,
 *  which runs before any session exists. */
export function apiGetPublic<T>(path: string): Promise<T> {
  return dedupedGet<T>(path, async () => {
    const res = await fetchWithRetry(`${getApiUrl()}${path}`, {}, true);
    if (!res.ok) return parseError(res);
    return (await res.json()) as T;
  });
}

export function formatMinor(minor: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}
