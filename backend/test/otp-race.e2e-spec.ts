/* eslint-disable @typescript-eslint/no-unsafe-member-access --
 * HTTP response bodies are untyped JSON in an e2e test; asserting on their shape IS the test. */
import { createHash } from 'node:crypto';
import type Redis from 'ioredis';
import { createHarness, type Harness } from './support/harness';
import { REDIS_CONNECTION } from '../src/database/redis.module';
import { OtpRepository } from '../src/modules/identity/otp/otp.repository';

/**
 * H2 — OTP attempt cap must hold under concurrency. The old implementation
 * read `attempts`, compared in Node, then read-modify-wrote the counter, so
 * 120 parallel wrong guesses were all evaluated against a cap of 5. These
 * tests hit the real HTTP path and real Redis.
 */
jest.setTimeout(120_000);

const sha = (c: string) => createHash('sha256').update(c).digest('hex');

describe('OTP verification is race-safe (H2)', () => {
  let h: Harness;
  let redis: Redis;
  let otp: OtpRepository;
  let email: string;
  const keyOf = (id: string) => `otp:challenge:${id}`;

  const verify = (code: string, id = email) =>
    h.api('POST', '/auth/otp/verify', undefined, {
      body: { identifier: id, code },
    });

  const attemptsOf = async (id = email) =>
    (JSON.parse((await redis.get(keyOf(id)))!) as { attempts: number })
      .attempts;

  beforeAll(async () => {
    h = await createHarness('otprace');
    redis = h.app.get<Redis>(REDIS_CONNECTION, { strict: false });
    otp = h.app.get(OtpRepository, { strict: false });
    const user = await h.makeUser('student', 'otp');
    email = `${h.MARKER}-otp@example.test`;
    expect(user.id).toBeTruthy();
  });

  afterAll(async () => {
    await redis.del(keyOf(email));
    await h.close();
  });

  it('100 simultaneous WRONG guesses: at most 5 are evaluated, the rest are locked out', async () => {
    await otp.create(email, sha('123456'), 300);
    const guesses = Array.from({ length: 100 }, (_, i) =>
      String(100000 + i).padStart(6, '0'),
    );
    const results = await Promise.all(guesses.map((g) => verify(g)));

    const evaluated = results.filter((r) =>
      /Incorrect OTP/.test(JSON.stringify(r.body)),
    ).length;
    const locked = results.filter((r) =>
      /Too many incorrect attempts/.test(JSON.stringify(r.body)),
    ).length;

    expect(results.every((r) => r.status === 401)).toBe(true);
    expect(evaluated).toBe(5); // exactly the configured maximum
    expect(locked).toBe(95);
    expect(await attemptsOf()).toBe(5); // never exceeds the cap
  });

  it('once locked, even the CORRECT code is rejected (existing semantics)', async () => {
    const res = await verify('123456');
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).toMatch(/Too many incorrect attempts/);
  });

  it('a wrong attempt does not reset or extend the challenge TTL', async () => {
    await otp.create(email, sha('123456'), 120);
    const before = await redis.pttl(keyOf(email));
    await verify('000000');
    const after = await redis.pttl(keyOf(email));
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThanOrEqual(before);
    expect(before - after).toBeLessThan(5000);
    expect(await attemptsOf()).toBe(1);
  });

  it('a valid OTP still works after some failures, and is single-use once consumed', async () => {
    await otp.create(email, sha('654321'), 300);
    await Promise.all(['111111', '222222', '333333'].map((g) => verify(g)));
    expect(await attemptsOf()).toBe(3);

    const ok = await verify('654321');
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTruthy();

    const replay = await verify('654321');
    expect(replay.status).toBe(401); // consumed
    expect(JSON.stringify(replay.body)).toMatch(/No active OTP/);
  });

  it('stores only the hash — the plaintext code is never in Redis', async () => {
    await otp.create(email, sha('777777'), 60);
    const raw = (await redis.get(keyOf(email)))!;
    expect(raw).not.toContain('777777');
    expect(raw).toContain(sha('777777'));
  });

  it('a missing challenge is reported as such, not as a wrong code', async () => {
    await redis.del(keyOf(email));
    const res = await verify('123456');
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).toMatch(/No active OTP/);
  });

  it('request counter: 30 parallel increments are all counted, and the window always has a TTL', async () => {
    const id = `${h.MARKER}-ratelimit@example.test`;
    const counts = await Promise.all(
      Array.from({ length: 30 }, () => otp.incrementRequestCount(id, 900)),
    );
    expect([...counts].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
    const ttl = await redis.ttl(`otp:ratelimit:${id}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(900);

    // A counter left without a TTL (crash between INCR and EXPIRE in the old
    // implementation) is repaired instead of locking the identifier forever.
    await redis.persist(`otp:ratelimit:${id}`);
    expect(await redis.ttl(`otp:ratelimit:${id}`)).toBe(-1);
    await otp.incrementRequestCount(id, 900);
    expect(await redis.ttl(`otp:ratelimit:${id}`)).toBeGreaterThan(0);
    await redis.del(`otp:ratelimit:${id}`);
  });
});
