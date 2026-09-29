import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import {
  configureHttpApp,
  createFastifyAdapter,
} from '../src/common/http/app-setup';

/**
 * H3 — the global limiter must key on the REAL client, and the OTP endpoints
 * must carry their own per-IP ceilings. Uses the real ThrottlerGuard (the
 * shared harness disables it) with the adapter built exactly as production
 * builds it.
 */
jest.setTimeout(120_000);

async function boot(env: NodeJS.ProcessEnv) {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    createFastifyAdapter(env),
  );
  configureHttpApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

// Production-shaped requests: container socket = Render's internal proxy.
const RENDER_SOCKET = '10.226.90.7';
const chain = (spoof: string, client: string) =>
  `${spoof}, ${client}, 172.71.195.123, 10.226.90.65`;

describe('global rate limiter keys on the real client (H3)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await boot({ NODE_ENV: 'production' });
  });
  afterAll(async () => {
    await app.close();
  });

  const hit = (remoteAddress: string, xff?: string, url = '/health') =>
    app.inject({
      method: 'GET',
      url,
      remoteAddress,
      headers: xff ? { 'x-forwarded-for': xff } : {},
    });

  it('rotating a spoofed X-Forwarded-For prefix does not escape the bucket', async () => {
    const client = '203.0.113.50';
    const catalog = '/catalog/subjects';
    const statuses: number[] = [];
    for (let i = 0; i < 320; i++) {
      // a different fake left-most entry on every request
      const res = await hit(
        RENDER_SOCKET,
        chain(`198.51.${(i >> 8) & 255}.${i & 255}`, client),
        catalog,
      );
      statuses.push(res.statusCode);
    }
    const throttled = statuses.filter((s) => s === 429).length;
    expect(throttled).toBeGreaterThanOrEqual(15); // 320 - 300 limit
    expect(statuses.slice(0, 300).every((s) => s === 200)).toBe(true);
  });

  it('a throttled response is 429 with a Retry-After the browser can read', async () => {
    const res = await hit(
      RENDER_SOCKET,
      chain('7.7.7.7', '203.0.113.50'),
      '/catalog/subjects',
    );
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('a different real client is NOT affected (no collateral throttling)', async () => {
    const res = await hit(
      RENDER_SOCKET,
      chain('7.7.7.7', '203.0.113.99'),
      '/catalog/subjects',
    );
    expect(res.statusCode).toBe(200);
  });

  it('legitimate proxied traffic is keyed per client, not per Cloudflare/Render hop', async () => {
    // Two clients through the SAME Cloudflare edge + Render hop stay separate.
    const a = await hit(
      RENDER_SOCKET,
      chain('1.1.1.1', '203.0.113.201'),
      '/health',
    );
    const b = await hit(
      RENDER_SOCKET,
      chain('1.1.1.1', '203.0.113.202'),
      '/health',
    );
    expect(a.statusCode).not.toBe(429);
    expect(b.statusCode).not.toBe(429);
  });

  it('OTP verify flooding: the per-IP ceiling (30/min) trips even with rotating XFF', async () => {
    const client = '203.0.113.150';
    const statuses: number[] = [];
    for (let i = 0; i < 40; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/otp/verify',
        remoteAddress: RENDER_SOCKET,
        headers: {
          'x-forwarded-for': chain(`9.9.${i}.1`, client),
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          identifier: 'nobody@example.test',
          code: '000000',
        }),
      });
      statuses.push(res.statusCode);
    }
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(10);
    expect(statuses.slice(0, 30).every((s) => s !== 429)).toBe(true);
  });

  it('OTP request flooding: the per-IP ceiling (10/min) trips before any email is sent', async () => {
    const client = '203.0.113.151';
    const statuses: number[] = [];
    for (let i = 0; i < 15; i++) {
      // invalid identifier -> 400 from validation (no OTP is generated or
      // emailed), yet every attempt still counts against the IP bucket
      const res = await app.inject({
        method: 'POST',
        url: '/auth/otp/request',
        remoteAddress: RENDER_SOCKET,
        headers: {
          'x-forwarded-for': chain(`8.8.${i}.1`, client),
          'content-type': 'application/json',
        },
        payload: JSON.stringify({ identifier: '' }),
      });
      statuses.push(res.statusCode);
    }
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses.slice(10).every((s) => s === 429)).toBe(true);
  });
});

describe('outside production X-Forwarded-For is ignored (no bypass in dev either)', () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    app = await boot({ NODE_ENV: 'development' });
  });
  afterAll(async () => {
    await app.close();
  });

  it('rotating XFF from one socket still hits one bucket', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 310; i++) {
      const res = await app.inject({
        method: 'GET',
        url: '/catalog/subjects',
        remoteAddress: '198.51.100.9',
        headers: { 'x-forwarded-for': `10.0.${(i >> 8) & 255}.${i & 255}` },
      });
      statuses.push(res.statusCode);
    }
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(10);
  });
});
