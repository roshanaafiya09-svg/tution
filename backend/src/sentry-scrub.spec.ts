import type { ErrorEvent, EventHint } from '@sentry/nestjs';
import { scrubSentryEvent } from './sentry-scrub';

/**
 * SEC-10: Sentry had no beforeSend/scrubbing at all — this is the fix,
 * covering the concrete leak paths an error report could carry:
 * Authorization/Cookie headers, and token/OTP/password fields nested
 * anywhere in the request body or extra context.
 */
describe('scrubSentryEvent', () => {
  const hint = {} as EventHint;

  it('redacts Authorization and Cookie headers, leaving other headers intact', () => {
    const event = {
      request: {
        headers: {
          Authorization: 'Bearer secret-token',
          Cookie: 'refresh_token=abc123',
          'user-agent': 'Mozilla/5.0',
        },
      },
    } as unknown as ErrorEvent;

    const result = scrubSentryEvent(event, hint);

    expect(result.request?.headers?.Authorization).toBe('[Filtered]');
    expect(result.request?.headers?.Cookie).toBe('[Filtered]');
    expect(result.request?.headers?.['user-agent']).toBe('Mozilla/5.0');
  });

  it('strips request.cookies entirely', () => {
    const event = {
      request: { cookies: { refresh_token: 'abc123' } },
    } as unknown as ErrorEvent;

    const result = scrubSentryEvent(event, hint);

    expect(result.request?.cookies).toBeUndefined();
  });

  it('redacts sensitive fields nested inside the request body', () => {
    const event = {
      request: {
        data: {
          identifier: 'user@example.com',
          otp: '123456',
          nested: { accessToken: 'jwt.here', ok: true },
        },
      },
    } as unknown as ErrorEvent;

    const result = scrubSentryEvent(event, hint);

    const data = result.request?.data as Record<string, unknown>;
    expect(data.identifier).toBe('user@example.com');
    expect(data.otp).toBe('[Filtered]');
    expect((data.nested as Record<string, unknown>).accessToken).toBe(
      '[Filtered]',
    );
    expect((data.nested as Record<string, unknown>).ok).toBe(true);
  });

  it('redacts sensitive fields inside extra context', () => {
    const event = {
      extra: { password: 'hunter2', debugInfo: 'fine' },
    } as unknown as ErrorEvent;

    const result = scrubSentryEvent(event, hint);

    expect(result.extra?.password).toBe('[Filtered]');
    expect(result.extra?.debugInfo).toBe('fine');
  });

  it('is a no-op on an event with no request/extra/contexts', () => {
    const event = { message: 'plain error' } as unknown as ErrorEvent;
    expect(scrubSentryEvent(event, hint)).toEqual(event);
  });
});
