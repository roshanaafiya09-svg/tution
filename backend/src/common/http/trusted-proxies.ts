/**
 * Which network hops may vouch for `X-Forwarded-For` (audit H3).
 *
 * The old adapter used `trustProxy: true`, which makes Fastify take the
 * LEFT-most X-Forwarded-For entry as the client — a value the client itself
 * controls. Rotating that header gave every request its own rate-limit
 * bucket (330 requests, 0 throttled).
 *
 * The rule now: walk the chain from the right (the socket peer, then each
 * X-Forwarded-For entry) and skip only addresses that belong to OUR OWN
 * infrastructure; the first address that is not is the client. Anything a
 * client prepends sits further left and is never reached.
 *
 * Deployment topology (Render, verified from Render's own header example
 * `x-forwarded-for: <client>, <Cloudflare 172.71.x.x>, <Render 10.x.x.x>`):
 *   client -> Cloudflare -> Render load balancer -> container
 * so the trusted hops are Cloudflare's published ranges plus Render's
 * private network. Not a hop COUNT, so a topology change that adds/removes
 * an internal hop does not silently re-open spoofing or collapse every user
 * into one bucket.
 */

/** RFC1918 / loopback / link-local / ULA — Render's internal network. */
export const PRIVATE_NETWORKS = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '::1/128',
  'fc00::/7',
  'fe80::/10',
];

/** https://www.cloudflare.com/ips/ — update when Cloudflare publishes a
 *  change. Only ever consulted in production (or when explicitly set). */
export const CLOUDFLARE_NETWORKS = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

export type TrustProxySetting = boolean | number | string[];

/**
 * Resolves the Fastify `trustProxy` option from the environment.
 *  1. TRUST_PROXY_CIDRS  — comma list of CIDRs/IPs that may vouch (explicit)
 *  2. TRUST_PROXY_HOPS   — fixed hop count (0 disables), for a topology that
 *                          is not Render + Cloudflare
 *  3. production default — Render private network + Cloudflare
 *  4. otherwise          — trust nobody: `request.ip` is the socket peer and
 *                          X-Forwarded-For is ignored entirely
 * Never returns `true` (trust every hop).
 */
export function resolveTrustProxy(
  env: NodeJS.ProcessEnv = process.env,
): TrustProxySetting {
  const cidrs = env.TRUST_PROXY_CIDRS?.trim();
  if (cidrs) {
    const list = cidrs
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length > 0) return list;
  }

  const hops = env.TRUST_PROXY_HOPS?.trim();
  if (hops) {
    const n = Number(hops);
    if (!Number.isInteger(n) || n < 0 || n > 5) {
      throw new Error(
        `TRUST_PROXY_HOPS must be an integer between 0 and 5 (got "${hops}")`,
      );
    }
    return n === 0 ? false : n;
  }

  if (env.NODE_ENV === 'production') {
    return [...PRIVATE_NETWORKS, ...CLOUDFLARE_NETWORKS];
  }
  return false;
}
