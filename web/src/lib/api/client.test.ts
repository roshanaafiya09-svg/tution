import { describe, expect, it, vi } from 'vitest';
import { api, apiPost, ApiError, onSessionLost, session } from '@/lib/api';
import { configureApi } from '@/lib/api/config';
import { setApiLogger, type ApiLogEntry } from '@/lib/api/log';
import { academyContext, teachingContext } from '@/lib/teaching-context';
import { envelope, mockFetch, ok } from '@/test/fetch-mock';

const ACADEMY_ID = '11111111-1111-4111-8111-111111111111';

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    return err as ApiError;
  }
  throw new Error('expected the request to fail');
}

describe('api client — every status becomes one structured ApiError', () => {
  const cases: Array<[number, string, string, string]> = [
    // status, code, message, expected kind
    [400, 'BAD_REQUEST', 'Bad input', 'validation'],
    [401, 'UNAUTHENTICATED', 'expired', 'unauthenticated'],
    [403, 'FORBIDDEN', 'nope', 'forbidden'],
    [404, 'NOT_FOUND', 'Batch not found', 'not_found'],
    [409, 'CONFLICT', 'already decided', 'conflict'],
    [422, 'UNPROCESSABLE', 'invalid', 'validation'],
    [429, 'RATE_LIMITED', 'slow down', 'rate_limited'],
    [500, 'INTERNAL_ERROR', 'boom', 'server'],
    [502, 'BAD_GATEWAY', 'bad gw', 'bad_gateway'],
    [503, 'SERVICE_UNAVAILABLE', 'unavail', 'unavailable'],
    [504, 'GATEWAY_TIMEOUT', 'timeout', 'gateway_timeout'],
  ];

  it.each(cases)('%i → kind %s preserved end to end', async (status, code, message, kind) => {
    // 401 is handled separately (refresh), so isolate it from the session flow.
    mockFetch({
      'GET /x': envelope(status, code, message),
      'POST /auth/refresh': envelope(401, 'UNAUTHENTICATED', 'no session'),
    });
    onSessionLost(() => undefined);
    const err = await failure(api.get('/x'));
    expect(err.status).toBe(status);
    expect(err.kind).toBe(kind);
    expect(err.code).toBe(code);
    expect(err.requestId).toBe(`srv-req-${status}-abcdef`); // backend's id survives
    expect(err.message).toBe(message);
  });

  it('a network failure is kind "network" with status 0 and no HTTP code', async () => {
    mockFetch({ 'GET /x': { networkError: true } });
    const err = await failure(api.get('/x', { retry: false }));
    expect(err).toMatchObject({ kind: 'network', status: 0, code: 'NETWORK_ERROR' });
  });

  it('an HTML error page from a proxy (Render 502) is a bad_gateway, not a JSON crash', async () => {
    mockFetch({ 'GET /x': { status: 502, html: '<html>Bad gateway</html>' } });
    const err = await failure(api.get('/x', { retry: false }));
    expect(err).toMatchObject({ kind: 'bad_gateway', status: 502, serverMessage: false });
    expect(err.message).not.toContain('<html>');
  });

  it('a 200 with an unreadable body is an error, never data', async () => {
    mockFetch({ 'GET /x': { status: 200, html: 'not json' } });
    const err = await failure(api.get('/x'));
    expect(err).toMatchObject({ kind: 'unknown', code: 'INVALID_RESPONSE' });
  });

  it('parses Retry-After on a 429', async () => {
    mockFetch({
      'GET /x': { status: 429, body: { code: 'RATE_LIMITED', message: 'slow' }, headers: { 'retry-after': '12' } },
    });
    const err = await failure(api.get('/x'));
    expect(err.retryAfterSeconds).toBe(12);
  });

  it('204 and an empty 200 body are successes (null), distinct from failure', async () => {
    mockFetch({ 'GET /a': { status: 204 }, 'GET /b': { status: 200 } });
    await expect(api.get('/a')).resolves.toBeUndefined();
    await expect(api.get('/b')).resolves.toBeNull();
  });
});

describe('api client — timeouts', () => {
  it('a request that never answers fails as a timeout (not a "connection" error)', async () => {
    mockFetch({ 'GET /slow': { hang: true } });
    configureApi({ timeoutMs: 15, retryDelaysMs: [] });
    const err = await failure(api.get('/slow'));
    expect(err).toMatchObject({ kind: 'timeout', code: 'REQUEST_TIMEOUT', status: 0 });
  });

  it('a timed-out GET is retried automatically', async () => {
    const m = mockFetch({ 'GET /slow': [{ hang: true }, { hang: true }, { status: 200, body: { ok: true } }] });
    configureApi({ timeoutMs: 15, retryDelaysMs: [0, 0, 0] });
    await expect(api.get('/slow')).resolves.toEqual({ ok: true });
    expect(m.to('GET /slow')).toHaveLength(3);
  });
});

describe('api client — automatic retry is for transient failures only', () => {
  it.each([502, 503, 504])('retries a %i and succeeds', async (status) => {
    const m = mockFetch({ 'GET /x': [envelope(status, 'X', 'gw'), envelope(status, 'X', 'gw'), ok([1])] });
    await expect(api.get('/x')).resolves.toEqual([1]);
    expect(m.to('GET /x')).toHaveLength(3);
  });

  it('retries network failures', async () => {
    const m = mockFetch({ 'GET /x': [{ networkError: true }, { networkError: true }, ok('fine')] });
    await expect(api.get('/x')).resolves.toBe('fine');
    expect(m.to('GET /x')).toHaveLength(3);
  });

  it('gives up after the bounded number of retries and reports how many attempts', async () => {
    const m = mockFetch({ 'GET /x': envelope(503, 'SERVICE_UNAVAILABLE', 'down') });
    const err = await failure(api.get('/x'));
    expect(m.to('GET /x')).toHaveLength(4); // 1 + 3 retries
    expect(err.attempts).toBe(4);
    expect(err.kind).toBe('unavailable');
  });

  it.each([
    [400, 'BAD_REQUEST'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [422, 'UNPROCESSABLE'],
    [429, 'RATE_LIMITED'],
    [500, 'INTERNAL_ERROR'],
  ])('does NOT auto-retry a %i', async (status, code) => {
    const m = mockFetch({ 'GET /x': envelope(status, code, 'no') });
    await failure(api.get('/x'));
    expect(m.to('GET /x')).toHaveLength(1);
  });

  it('never auto-retries a mutation — a POST that timed out may have been applied', async () => {
    const m = mockFetch({ 'POST /x': envelope(503, 'SERVICE_UNAVAILABLE', 'down') });
    await failure(api.post('/x', { a: 1 }));
    expect(m.to('POST /x')).toHaveLength(1);
  });

  it('can opt an idempotent mutation in to retry', async () => {
    const m = mockFetch({ 'PUT /x': [envelope(503, 'SERVICE_UNAVAILABLE', 'down'), ok({ saved: true })] });
    await expect(api.put('/x', {}, { retry: true })).resolves.toEqual({ saved: true });
    expect(m.to('PUT /x')).toHaveLength(2);
  });
});

describe('api client — 401 is handled centrally', () => {
  it('silently refreshes the session and replays the request', async () => {
    session.set('old-token', 'csrf');
    const m = mockFetch({
      'GET /me': (call) =>
        call.headers.authorization === 'Bearer new-token'
          ? ok({ id: 'u1' })
          : envelope(401, 'UNAUTHENTICATED', 'expired'),
      'POST /auth/refresh': ok({ accessToken: 'new-token', csrfToken: 'csrf2' }),
    });
    const lost = vi.fn();
    onSessionLost(lost);

    await expect(api.get('/me')).resolves.toEqual({ id: 'u1' });
    expect(m.to('POST /auth/refresh')).toHaveLength(1);
    expect(session.access).toBe('new-token');
    expect(lost).not.toHaveBeenCalled();
  });

  it('a burst of simultaneous 401s triggers ONE refresh and ONE redirect', async () => {
    session.set('old-token', 'csrf');
    const m = mockFetch({
      'GET /a': envelope(401, 'UNAUTHENTICATED', 'expired'),
      'GET /b': envelope(401, 'UNAUTHENTICATED', 'expired'),
      'GET /c': envelope(401, 'UNAUTHENTICATED', 'expired'),
      'POST /auth/refresh': envelope(401, 'UNAUTHENTICATED', 'no valid session'),
    });
    const lost = vi.fn();
    onSessionLost(lost);

    const results = await Promise.allSettled([api.get('/a'), api.get('/b'), api.get('/c')]);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(m.to('POST /auth/refresh')).toHaveLength(1);
    expect(lost).toHaveBeenCalledTimes(1);
    expect(session.access).toBeNull(); // invalid authentication cleared
  });

  it('when refresh fails, clears the session, raises the redirect event, and still throws a 401 ApiError', async () => {
    session.set('old-token', 'csrf');
    mockFetch({
      'GET /me': envelope(401, 'UNAUTHENTICATED', 'expired'),
      'POST /auth/refresh': envelope(401, 'UNAUTHENTICATED', 'revoked'),
    });
    const lost = vi.fn();
    onSessionLost(lost);
    const err = await failure(api.get('/me'));
    expect(err.kind).toBe('unauthenticated');
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it('does NOT sign the user out when the refresh call fails for a non-auth reason (server down)', async () => {
    session.set('old-token', 'csrf');
    mockFetch({
      'GET /me': envelope(401, 'UNAUTHENTICATED', 'expired'),
      'POST /auth/refresh': envelope(503, 'SERVICE_UNAVAILABLE', 'down'),
    });
    const lost = vi.fn();
    onSessionLost(lost);
    const err = await failure(api.get('/me'));
    expect(err.kind).toBe('unavailable'); // a "try again" error, not a logout
    expect(lost).not.toHaveBeenCalled();
    expect(session.access).toBe('old-token');
  });

  it('a wrong sign-in code (401 INVALID_OTP) is a normal form error — no refresh, no redirect', async () => {
    const m = mockFetch({ 'POST /auth/otp/verify': envelope(401, 'INVALID_OTP', 'Incorrect OTP.') });
    const lost = vi.fn();
    onSessionLost(lost);
    const err = await failure(apiPost('/auth/otp/verify', { code: '000000' }));
    expect(err.message).toBe('Incorrect OTP.');
    expect(m.to('POST /auth/refresh')).toHaveLength(0);
    expect(lost).not.toHaveBeenCalled();
  });

  it('an expired impersonation token is NOT silently swapped for the admin’s own session', async () => {
    session.setAccessOnly('impersonation-token');
    const m = mockFetch({
      'GET /me': envelope(401, 'UNAUTHENTICATED', 'expired'),
      'POST /auth/refresh': ok({ accessToken: 'admin-token', csrfToken: 'c' }),
    });
    const lost = vi.fn();
    onSessionLost(lost);
    await failure(api.get('/me'));
    expect(m.to('POST /auth/refresh')).toHaveLength(0);
    expect(lost).toHaveBeenCalledTimes(1);
  });
});

describe('api client — teaching profile (Individual / Academy) is attached centrally', () => {
  it('defaults to Individual on every authenticated request', async () => {
    session.set('t', 'c');
    const m = mockFetch({ 'GET /batches/me': ok([]), 'POST /batches': ok({ id: 'b' }) });
    await api.get('/batches/me');
    await api.post('/batches', { title: 't' });
    expect(m.calls.map((c) => c.headers['x-teaching-context'])).toEqual(['individual', 'individual']);
  });

  it('follows the selected academy with no per-call code', async () => {
    session.set('t', 'c');
    const m = mockFetch({ 'GET /batches/me': ok([]), 'DELETE /batches/x': { status: 204 }, 'PUT /y': ok({}) });
    teachingContext.set(academyContext(ACADEMY_ID));
    await api.get('/batches/me');
    await api.delete('/batches/x');
    await api.put('/y', {});
    expect(m.calls.map((c) => c.headers['x-teaching-context'])).toEqual([
      `academy:${ACADEMY_ID}`,
      `academy:${ACADEMY_ID}`,
      `academy:${ACADEMY_ID}`,
    ]);
  });

  it('is re-read on every request, so switching profile changes the very next call', async () => {
    session.set('t', 'c');
    const m = mockFetch({ 'GET /x': ok(1) });
    await api.get('/x');
    teachingContext.set(academyContext(ACADEMY_ID));
    await api.get('/x');
    teachingContext.reset();
    await api.get('/x');
    expect(m.calls.map((c) => c.headers['x-teaching-context'])).toEqual([
      'individual',
      `academy:${ACADEMY_ID}`,
      'individual',
    ]);
  });

  it('the same URL in two profiles is two requests — responses are never shared across profiles', async () => {
    session.set('t', 'c');
    const m = mockFetch({
      'GET /batches/me': (call) =>
        call.headers['x-teaching-context'] === 'individual' ? ok(['individual-batch']) : ok(['academy-batch']),
    });
    const individual = api.get<string[]>('/batches/me');
    teachingContext.set(academyContext(ACADEMY_ID));
    const academy = api.get<string[]>('/batches/me');
    expect(await individual).toEqual(['individual-batch']);
    expect(await academy).toEqual(['academy-batch']);
    expect(m.to('GET /batches/me')).toHaveLength(2);
  });

  it('is not sent on unauthenticated (login) requests', async () => {
    const m = mockFetch({ 'POST /auth/otp/request': ok({}) });
    teachingContext.set(academyContext(ACADEMY_ID));
    await apiPost('/auth/otp/request', { identifier: 'a@b.c' });
    expect(m.calls[0].headers['x-teaching-context']).toBeUndefined();
    expect(m.calls[0].headers.authorization).toBeUndefined();
  });

  it('an Academy authorization error reaches the caller intact — code, message and request id', async () => {
    session.set('t', 'c');
    mockFetch({
      'GET /batches/me': envelope(
        403,
        'TEACHING_CONTEXT_FORBIDDEN',
        "You aren't an active member of that academy",
      ),
    });
    teachingContext.set(academyContext(ACADEMY_ID));
    const err = await failure(api.get('/batches/me'));
    expect(err).toMatchObject({
      kind: 'forbidden',
      code: 'TEACHING_CONTEXT_FORBIDDEN',
      requestId: 'srv-req-403-abcdef',
      message: "You aren't an active member of that academy",
    });
  });
});

describe('api client — request ids and structured logging', () => {
  it('sends a unique X-Request-Id on every request', async () => {
    session.set('t', 'c');
    const m = mockFetch({ 'GET /a': ok(1), 'GET /b': ok(2) });
    await api.get('/a');
    await api.get('/b');
    const ids = m.calls.map((c) => c.headers['x-request-id']);
    expect(ids[0]).toMatch(/^[\w.:-]{8,64}$/);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('a failure with no server response still carries the id we sent (for client logs)', async () => {
    session.set('t', 'c');
    const m = mockFetch({ 'GET /a': { networkError: true } });
    const err = await failure(api.get('/a', { retry: false }));
    expect(err.requestId).toBe(m.calls[0].headers['x-request-id']);
  });

  it('logs one structured entry per failed call with everything needed to trace it', async () => {
    session.set('t', 'c');
    const entries: ApiLogEntry[] = [];
    setApiLogger((e) => entries.push(e));
    mockFetch({ 'GET /batches/11111111-1111-4111-8111-111111111111/students': envelope(500, 'INTERNAL_ERROR', 'boom') });
    teachingContext.set(academyContext(ACADEMY_ID));

    await failure(api.get('/batches/11111111-1111-4111-8111-111111111111/students?secret=1'));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      event: 'api_failure',
      level: 'error',
      final: true,
      method: 'GET',
      path: '/batches/:id/students', // id and query string stripped
      status: 500,
      code: 'INTERNAL_ERROR',
      kind: 'server',
      requestId: 'srv-req-500-abcdef',
      teachingContext: `academy:${ACADEMY_ID}`,
      attempt: 1,
    });
    expect(JSON.stringify(entries[0])).not.toContain('secret');
  });

  it('logs each automatic retry, then the final failure', async () => {
    const entries: ApiLogEntry[] = [];
    setApiLogger((e) => entries.push(e));
    mockFetch({ 'GET /x': envelope(503, 'SERVICE_UNAVAILABLE', 'down') });
    await failure(api.get('/x'));
    expect(entries.map((e) => `${e.event}:${e.attempt}`)).toEqual([
      'api_retry:1',
      'api_retry:2',
      'api_retry:3',
      'api_failure:4',
    ]);
  });
});
