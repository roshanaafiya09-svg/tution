/**
 * SEC-06: gates a user-supplied URL (academy website, session/booking
 * meeting links) before it's ever used as an `<a href>`. The backend
 * DTOs already restrict these to http(s) at write time (see
 * upsert-academy.dto.ts, create-session.dto.ts, create-booking.dto.ts),
 * but a link rendered here shouldn't have to trust that every write
 * path — present or future — enforced that. Returns the URL unchanged
 * if it's a genuine http(s) URL, otherwise `undefined` so the caller
 * can skip rendering the link entirely rather than pass a `javascript:`
 * or `data:` string straight into `href`.
 */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}
