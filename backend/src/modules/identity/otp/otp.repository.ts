import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CONNECTION } from '../../../database/redis.module';

interface OtpChallenge {
  codeHash: string;
  attempts: number;
}

/**
 * Blueprint §6: "jti revocation in Redis" — OTP challenges are the same
 * shape of problem (short-lived, TTL-expiring, high-churn) so they live
 * here too rather than in Postgres. An identifier (phone number or email
 * — see identifier.util.ts) has at most one live challenge; Redis's own
 * TTL is what "expired" means, so callers never need to check an expiry
 * timestamp themselves.
 */
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
    const challenge: OtpChallenge = { codeHash, attempts: 0 };
    await this.redis.set(
      this.challengeKey(identifier),
      JSON.stringify(challenge),
      'EX',
      ttlSeconds,
    );
  }

  /** Increments the request counter for the rate-limit window, returning the new count. */
  async incrementRequestCount(
    identifier: string,
    windowSeconds: number,
  ): Promise<number> {
    const key = this.rateLimitKey(identifier);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSeconds);
    }
    return count;
  }

  async findActive(identifier: string): Promise<OtpChallenge | null> {
    const raw = await this.redis.get(this.challengeKey(identifier));
    return raw ? (JSON.parse(raw) as OtpChallenge) : null;
  }

  async incrementAttempts(identifier: string): Promise<void> {
    const key = this.challengeKey(identifier);
    const raw = await this.redis.get(key);
    if (!raw) return;
    const challenge = JSON.parse(raw) as OtpChallenge;
    challenge.attempts += 1;
    await this.redis.set(key, JSON.stringify(challenge), 'KEEPTTL');
  }

  async consume(identifier: string): Promise<void> {
    await this.redis.del(this.challengeKey(identifier));
  }
}
