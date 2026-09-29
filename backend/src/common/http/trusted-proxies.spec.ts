import Fastify from 'fastify';
import { resolveTrustProxy } from './trusted-proxies';

/** Builds a bare Fastify with the SAME trustProxy value the app would use
 *  and reports what `request.ip` resolves to for a given socket + header. */
async function clientIp(
  env: NodeJS.ProcessEnv,
  remoteAddress: string,
  xff?: string,
): Promise<string> {
  const app = Fastify({ trustProxy: resolveTrustProxy(env) });
  app.get('/ip', (req) => ({ ip: req.ip }));
  const res = await app.inject({
    method: 'GET',
    url: '/ip',
    remoteAddress,
    headers: xff ? { 'x-forwarded-for': xff } : {},
  });
  await app.close();
  return res.json<{ ip: string }>().ip;
}

const PROD = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;
// Render's documented shape: client, Cloudflare edge, Render internal hop;
// the container's socket peer is Render's internal proxy.
const RENDER_SOCKET = '10.226.90.7';
const CLOUDFLARE_EDGE = '172.71.195.123';
const RENDER_LB = '10.226.90.65';
const REAL_CLIENT = '81.97.145.24';

describe('resolveTrustProxy', () => {
  it('never trusts every hop', () => {
    expect(resolveTrustProxy({})).toBe(false);
    expect(resolveTrustProxy(PROD)).not.toBe(true);
    expect(Array.isArray(resolveTrustProxy(PROD))).toBe(true);
  });

  it('trusts nobody outside production by default', () => {
    expect(resolveTrustProxy({ NODE_ENV: 'development' })).toBe(false);
    expect(resolveTrustProxy({ NODE_ENV: 'test' })).toBe(false);
  });

  it('TRUST_PROXY_CIDRS overrides, TRUST_PROXY_HOPS is bounded', () => {
    expect(
      resolveTrustProxy({
        NODE_ENV: 'production',
        TRUST_PROXY_CIDRS: '10.0.0.0/8, 203.0.113.0/24',
      }),
    ).toEqual(['10.0.0.0/8', '203.0.113.0/24']);
    expect(resolveTrustProxy({ TRUST_PROXY_HOPS: '2' })).toBe(2);
    expect(resolveTrustProxy({ TRUST_PROXY_HOPS: '0' })).toBe(false);
    expect(() => resolveTrustProxy({ TRUST_PROXY_HOPS: '9' })).toThrow();
    expect(() => resolveTrustProxy({ TRUST_PROXY_HOPS: 'abc' })).toThrow();
  });
});

describe('request.ip derivation (H3)', () => {
  it('production: the real client is found through the Render/Cloudflare chain', async () => {
    const ip = await clientIp(
      PROD,
      RENDER_SOCKET,
      `${REAL_CLIENT}, ${CLOUDFLARE_EDGE}, ${RENDER_LB}`,
    );
    expect(ip).toBe(REAL_CLIENT);
  });

  it('production: prepending fake X-Forwarded-For entries does NOT change the client', async () => {
    for (const spoof of ['1.1.1.1', '8.8.8.8, 9.9.9.9', '203.0.113.77']) {
      const ip = await clientIp(
        PROD,
        RENDER_SOCKET,
        `${spoof}, ${REAL_CLIENT}, ${CLOUDFLARE_EDGE}, ${RENDER_LB}`,
      );
      expect(ip).toBe(REAL_CLIENT);
    }
  });

  it('production: a request with no forwarded chain resolves to the socket peer', async () => {
    expect(await clientIp(PROD, '198.51.100.20')).toBe('198.51.100.20');
  });

  it('production: an untrusted socket peer cannot vouch for a forged chain', async () => {
    // Someone connecting straight to the origin (not via our proxies) and
    // sending X-Forwarded-For gets their own address, not the forged one.
    expect(await clientIp(PROD, '198.51.100.20', '1.2.3.4')).toBe(
      '198.51.100.20',
    );
  });

  it('non-production: X-Forwarded-For is ignored entirely', async () => {
    expect(
      await clientIp({ NODE_ENV: 'development' }, '127.0.0.1', '9.9.9.9'),
    ).toBe('127.0.0.1');
  });

  it('a fixed hop count still resolves the right entry', async () => {
    const env = { TRUST_PROXY_HOPS: '1' } as NodeJS.ProcessEnv;
    expect(await clientIp(env, RENDER_LB, `1.2.3.4, ${REAL_CLIENT}`)).toBe(
      REAL_CLIENT,
    );
  });
});
