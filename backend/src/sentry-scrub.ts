import type { ErrorEvent, EventHint } from '@sentry/nestjs';

// SEC-10: Sentry had no beforeSend/sendDefaultPii config at all —
// relying entirely on the SDK's own default header redaction rather
// than an explicit, reviewable policy. This is the explicit policy:
// strip anything that could hand a reader of the Sentry dashboard a
// working credential (Authorization/Cookie headers, request bodies
// containing tokens/OTPs/passwords/secrets), while keeping the rest of
// the error report (stack trace, route, non-sensitive request shape)
// intact — that's the whole point of still having error monitoring.
const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-csrf-token',
]);

const SENSITIVE_KEY_PATTERN =
  /token|otp|password|passwd|secret|authorization|cookie|api[_-]?key/i;

function scrubHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers) return headers;
  const scrubbed: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    scrubbed[key] = SENSITIVE_HEADER_NAMES.has(key.toLowerCase())
      ? '[Filtered]'
      : value;
  }
  return scrubbed;
}

function scrubObjectDeep<T>(value: T, depth = 0): T {
  if (depth > 5 || value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    const items = value as unknown[];
    return items.map((item) => scrubObjectDeep(item, depth + 1)) as T;
  }

  const scrubbed: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    scrubbed[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? '[Filtered]'
      : scrubObjectDeep(val, depth + 1);
  }
  return scrubbed as T;
}

export function scrubSentryEvent(
  event: ErrorEvent,
  _hint: EventHint,
): ErrorEvent {
  if (event.request) {
    event.request.headers = scrubHeaders(event.request.headers);
    event.request.cookies = undefined;
    if (event.request.data !== undefined) {
      event.request.data = scrubObjectDeep(event.request.data);
    }
  }
  if (event.extra) {
    event.extra = scrubObjectDeep(event.extra);
  }
  if (event.contexts) {
    event.contexts = scrubObjectDeep(event.contexts);
  }
  return event;
}
