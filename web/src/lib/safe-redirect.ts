/**
 * Sanitizes a post-login `?next=` destination down to a same-origin,
 * path-only redirect — rejects absolute URLs, protocol-relative URLs
 * (`//evil.example`), and any other trick that would send a freshly
 * authenticated user off this origin. Resolving against a fixed dummy
 * base and comparing origins (rather than string-matching for `//` or
 * backslashes by hand) rides on the URL parser's own scheme/host
 * handling instead of re-implementing it.
 */
export function safeRedirectPath(candidate: string | null): string | null {
  if (!candidate || !candidate.startsWith('/')) return null;

  const base = 'http://internal.invalid';
  let url: URL;
  try {
    url = new URL(candidate, base);
  } catch {
    return null;
  }
  if (url.origin !== base) return null;

  return `${url.pathname}${url.search}${url.hash}`;
}
