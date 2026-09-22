import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';

/** A caller-supplied id is echoed into logs and response headers, so it
 *  must be short and free of anything that could forge a log line or a
 *  header (no whitespace/newlines/quotes). */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,64}$/;

export function sanitizeRequestId(raw: unknown): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && SAFE_REQUEST_ID.test(value)
    ? value
    : null;
}

/**
 * Fastify `genReqId`: honour the id the web client generated (so a failure
 * seen in the browser can be found in the server logs by that same id),
 * otherwise mint one. `requestIdHeader` is left disabled in the adapter
 * options precisely so this function is the only place ids are accepted.
 */
export function resolveRequestId(req: IncomingMessage): string {
  return sanitizeRequestId(req.headers[REQUEST_ID_HEADER]) ?? randomUUID();
}
