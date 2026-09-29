import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CONNECTION } from '../../../database/redis.module';

/** Outcome of one atomic verification attempt. */
export type OtpVerifyOutcome = 'ok' | 'invalid' | 'locked' | 'missing';

/**
 * Compare-and-count, executed by Redis as ONE atomic step (Lua scripts run
 * without interleaving). The previous implementation read the challenge,
 * compared in Node, then read-modify-wrote `attempts` — so N parallel wrong
 * guesses all saw `attempts < max` and all got evaluated (audit H2: 120/120
 * guesses evaluated against a cap of 5).
 *
 * Semantics preserved from the old service:
 *  - no challenge                     -> 'missing'
 *  - attempts already >= max          -> 'locked' (even a correct code)
 *  - hash matches                     -> 'ok' (attempts untouched; the
 *                                        challenge is consumed separately)
 *  - hash differs                     -> attempts + 1, 'invalid'
 * The challenge's remaining TTL is preserved (PTTL + SET PX), never reset.
 * Only the SHA-256 of the code is ever stored or compared.
 */
const VERIFY_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 'missing' end
local ok, challenge = pcall(cjson.decode, raw)
if not ok or type(challenge) ~= 'table' then return 'missing' end
local attempts = tonumber(challenge.attempts) or 0
local max = tonumber(ARGV[2])
if attempts >= max then return 'locked' end
if challenge.codeHash == ARGV[1] then return 'ok' end
challenge.attempts = attempts + 1
local ttl = redis.call('PTTL', KEYS[1])
if ttl > 0 then
  redis.call('SET', KEYS[1], cjson.encode(challenge), 'PX', ttl)
else
  redis.call('SET', KEYS[1], cjson.encode(challenge))
end
return 'invalid'
`;

/**
 * INCR + EXPIRE as one step. The old two-call version could die between
 * them and leave a counter with no TTL — a permanent OTP lockout for that
 * identifier. This also repairs an already-TTL-less key.
 */
const INCREMENT_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 or redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

@Injectable()
export class OtpRepository {
  constructor(@Inject(REDIS_CONNECTION) private readonly redis: Redis) {}

  private challengeKey(identifier: string): string {
    return `otp:challenge:${identifier}`;
  }

  private rateLimitKey(identifier: string): string {
    return `otp:ratelimit:${identifier}`;
  }

  async create(
    identifier: string,
    codeHash: string,
    ttlSeconds: number,
  ): Promise<void> {
    await this.redis.set(
      this.challengeKey(identifier),
      JSON.stringify({ codeHash, attempts: 0 }),
      'EX',
      ttlSeconds,
    );
  }

  async incrementRequestCount(
    identifier: string,
    windowSeconds: number,
  ): Promise<number> {
    const count = await this.redis.eval(
      INCREMENT_WINDOW_SCRIPT,
      1,
      this.rateLimitKey(identifier),
      String(windowSeconds),
    );
    return Number(count);
  }

  /** Atomically verifies `codeHash` against the active challenge and counts
   *  a failure. Safe under any number of concurrent callers. */
  async verifyAttempt(
    identifier: string,
    codeHash: string,
    maxAttempts: number,
  ): Promise<OtpVerifyOutcome> {
    const outcome = await this.redis.eval(
      VERIFY_SCRIPT,
      1,
      this.challengeKey(identifier),
      codeHash,
      String(maxAttempts),
    );
    return outcome as OtpVerifyOutcome;
  }

  async consume(identifier: string): Promise<void> {
    await this.redis.del(this.challengeKey(identifier));
  }
}
