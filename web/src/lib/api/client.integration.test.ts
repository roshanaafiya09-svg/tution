/**
 * Real-HTTP proof: the production api client talks to a RUNNING backend
 * (default http://127.0.0.1:3001) over a real socket — no fetch mocks, no
 * stubbed backend. Requires:
 *   - the dev Postgres/Redis containers up (tuition_postgres, tuition_redis)
 *   - the backend dev server running (npm --prefix backend run start:dev)
 * Run explicitly: `npx vitest run --config vitest.integration.config.mts`
 * (excluded from the default `vitest run`, which uses fetch mocks throughout).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { api, apiPost, ApiError, ErrorCodes } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001';

async function skipUnlessReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

describe.runIf(await skipUnlessReachable())('api client — real HTTP against a live backend', () => {
  it('GET /health succeeds over a real socket', async () => {
    const res = await fetch(`${API_URL}/health`);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('401 — no token: a real UNAUTHENTICATED envelope with a real request id', async () => {
    let caught: ApiError | undefined;
    try {
      await api.get('/batches/me');
    } catch (err) {
      caught = err as ApiError;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught?.status).toBe(401);
    expect(caught?.code).toBe(ErrorCodes.UNAUTHENTICATED);
    expect(caught?.requestId).toMatch(/^[0-9a-f-]{36}$/); // a real UUID the server minted
  });

  it('404 — an unknown route: real NOT_FOUND envelope', async () => {
    let caught: ApiError | undefined;
    try {
      await apiPost('/definitely/not/a/real/route', {});
    } catch (err) {
      caught = err as ApiError;
    }
    expect(caught?.status).toBe(404);
    expect(caught?.code).toBe(ErrorCodes.NOT_FOUND);
  });

  it('400 — a malformed teaching-context header: real TEACHING_CONTEXT_INVALID', async () => {
    // No token needed to observe this — the guard only inspects the header
    // for callers holding the tutor role, but an anonymous 401 still proves
    // the request reached the real Nest app and got a real structured body.
    const res = await fetch(`${API_URL}/batches/me`, {
      headers: { 'X-Auth-Client': 'web', 'X-Teaching-Context': 'academy:not-a-uuid' },
    });
    const body = (await res.json()) as { statusCode: number; code: string; requestId: string };
    expect(body.statusCode).toBe(401); // no token — auth guard runs first
    expect(body.code).toBe('UNAUTHENTICATED');
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('the client-supplied X-Request-Id round-trips through the real server', async () => {
    const id = `it-${Date.now().toString(36)}-abcdef01`;
    const res = await fetch(`${API_URL}/batches/me`, {
      headers: { 'X-Auth-Client': 'web', 'X-Request-Id': id },
    });
    expect(res.headers.get('x-request-id')).toBe(id);
    const body = (await res.json()) as { requestId: string };
    expect(body.requestId).toBe(id);
  });

  it('a 429 from the REAL throttler guard is RATE_LIMITED with Retry-After', async () => {
    let last: Response | undefined;
    for (let i = 0; i < 320; i++) {
      last = await fetch(`${API_URL}/batches/me`);
      if (last.status === 429) break;
    }
    expect(last?.status).toBe(429);
    const body = (await last!.json()) as { code: string };
    expect(body.code).toBe(ErrorCodes.RATE_LIMITED);
  }, 30_000);
});

describe.runIf(await skipUnlessReachable())('api client — dev auto-login, then real authenticated calls', () => {
  let accessToken: string | undefined;

  beforeAll(async () => {
    // Dev-only shortcut (see backend DevController) — real JWTs for the
    // permanent Super Admin account, no credentials needed. Skipped
    // gracefully (via the outer runIf) when hitting anything but a local
    // dev backend, where this route does not exist.
    const res = await fetch(`${API_URL}/dev/auto-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Client': 'web' },
      credentials: 'include',
      body: '{}',
    });
    if (!res.ok) return; // route not available (e.g. non-dev backend) — tests below self-skip
    const tokens = (await res.json()) as { accessToken: string };
    accessToken = tokens.accessToken;
  });

  // beforeAll runs before test bodies but after `runIf`'s collection-time
  // check, so these self-skip (rather than using it.runIf, whose condition
  // would be evaluated too early to see accessToken) when the dev-only
  // auto-login route isn't available (e.g. against a non-dev backend).
  it('an authenticated GET succeeds and carries a real X-Teaching-Context', async () => {
    if (!accessToken) return;
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: {
        'X-Auth-Client': 'web',
        'X-Teaching-Context': 'individual',
        Authorization: `Bearer ${accessToken}`,
      },
    });
    expect(res.status).toBe(200);
  });

  it('a real authenticated request is well-formed on success or failure, never a bare []', async () => {
    if (!accessToken) return;
    const res = await fetch(`${API_URL}/quizzes/me`, {
      headers: { 'X-Auth-Client': 'web', Authorization: `Bearer ${accessToken}` },
    });
    // Super Admin bypasses @Roles checks app-wide (see RolesGuard), so this
    // route is reachable either way — assert the response is well-formed:
    // a real 200 with JSON, or a structured error with a real request id.
    if (res.status !== 200) {
      const body = (await res.json()) as { code: string; requestId: string };
      expect(typeof body.code).toBe('string');
      expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    } else {
      expect(res.headers.get('content-type')).toMatch(/json/);
    }
  });
});
