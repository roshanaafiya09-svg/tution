import { vi } from 'vitest';

/** One scripted answer to a fetch call. */
export type Reply =
  | { status: number; body?: unknown; headers?: Record<string, string>; html?: string }
  | { networkError: true }
  | { hang: true };

export interface Call {
  url: string;
  path: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** The backend's standard error envelope, as the real filter emits it. */
export function envelope(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): Reply {
  return {
    status,
    body: { statusCode: status, code, error: 'x', message, requestId: `srv-req-${status}-abcdef`, ...extra },
    headers: { 'x-request-id': `srv-req-${status}-abcdef` },
  };
}

export const ok = (body: unknown): Reply => ({ status: 200, body });

function toResponse(reply: Reply, signal: AbortSignal | undefined): Promise<Response> {
  if ('networkError' in reply) return Promise.reject(new TypeError('Failed to fetch'));
  if ('hang' in reply) {
    return new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });
  }
  const headers = new Headers(reply.headers);
  if (reply.html !== undefined) {
    headers.set('content-type', 'text/html');
    return Promise.resolve(new Response(reply.html, { status: reply.status, headers }));
  }
  if (reply.body === undefined) return Promise.resolve(new Response(null, { status: reply.status, headers }));
  headers.set('content-type', 'application/json');
  return Promise.resolve(new Response(JSON.stringify(reply.body), { status: reply.status, headers }));
}

/**
 * Stubs global fetch. `routes` maps "METHOD /path" to a reply, or to a list
 * of replies consumed in order (the last one repeats) — so a test can say
 * "503, 503, then 200".
 */
export function mockFetch(routes: Record<string, Reply | Reply[] | ((call: Call) => Reply)>) {
  const calls: Call[] = [];
  const cursor = new Map<string, number>();

  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]),
    );
    let body: unknown = init?.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        /* leave as string */
      }
    }
    const call: Call = { url, path, method, headers, body };
    calls.push(call);

    const key = `${method} ${path.split('?')[0]}`;
    const route = routes[key];
    if (route === undefined) {
      return Promise.resolve(
        new Response(JSON.stringify({ statusCode: 404, code: 'NOT_FOUND', message: `unmocked ${key}` }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    let reply: Reply;
    if (typeof route === 'function') reply = route(call);
    else if (Array.isArray(route)) {
      const i = cursor.get(key) ?? 0;
      reply = route[Math.min(i, route.length - 1)];
      cursor.set(key, i + 1);
    } else reply = route;
    return toResponse(reply, init?.signal ?? undefined);
  });

  vi.stubGlobal('fetch', fn);
  return {
    fn,
    calls,
    /** Calls to a route, in order. */
    to: (key: string) => calls.filter((c) => `${c.method} ${c.path.split('?')[0]}` === key),
  };
}
