import * as Sentry from '@sentry/nextjs';
import posthog from 'posthog-js';

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

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

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

export const tokenStore = {
  get access() {
    return typeof window === 'undefined' ? null : localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  get refresh() {
    return typeof window === 'undefined' ? null : localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  set(accessToken: string, refreshToken: string) {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },
  clear() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

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
 * mid-task. A failed refresh clears tokens — the caller sees the 401.
 */
async function refreshTokens(): Promise<boolean> {
  const refreshToken = tokenStore.refresh;
  if (!refreshToken) return false;

  const res = await fetch(`${getApiUrl()}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    tokenStore.clear();
    return false;
  }

  const tokens = (await res.json()) as { accessToken: string; refreshToken: string };
  tokenStore.set(tokens.accessToken, tokens.refreshToken);
  return true;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  retryOn401 = true,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const accessToken = tokenStore.access;
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${getApiUrl()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

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

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

/** Unauthenticated — used by the login page before tokens exist. */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${getApiUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as T;
}

/** Unauthenticated GET — used by the login flow's Telegram-link polling,
 *  which runs before any session exists. */
export async function apiGetPublic<T>(path: string): Promise<T> {
  const res = await fetch(`${getApiUrl()}${path}`);
  if (!res.ok) return parseError(res);
  return (await res.json()) as T;
}

export function formatMinor(minor: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}
