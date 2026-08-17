import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CONNECTION } from '../../../database/redis.module';

interface StoredRefreshToken {
  userId: string;
  deviceLabel?: string;
  /** Set by revoke() instead of deleting the key outright — keeps a
   *  record, until the token's original TTL naturally expires, that
   *  this jti belonged to a real session and was legitimately rotated
   *  or revoked. Lets a later reuse attempt be told apart from "this
   *  jti never existed" — see TokensService.verifyRefreshToken. */
  revoked?: boolean;
}

@Injectable()
export class RefreshTokenRepository {
  constructor(@Inject(REDIS_CONNECTION) private readonly redis: Redis) {}

  private tokenKey(jti: string): string {
    return `refresh:token:${jti}`;
  }

  private userIndexKey(userId: string): string {
    return `refresh:user:${userId}`;
  }

  async create(
    userId: string,
    jti: string,
    ttlSeconds: number,
    deviceLabel?: string,
  ): Promise<void> {
    const value: StoredRefreshToken = { userId, deviceLabel };
    await Promise.all([
      this.redis.set(
        this.tokenKey(jti),
        JSON.stringify(value),
        'EX',
        ttlSeconds,
      ),
      this.redis.sadd(this.userIndexKey(userId), jti),
      this.redis.expire(this.userIndexKey(userId), ttlSeconds),
    ]);
  }

  async findActiveByJti(jti: string): Promise<StoredRefreshToken | null> {
    const stored = await this.findAnyByJti(jti);
    return stored && !stored.revoked ? stored : null;
  }

  /** Same lookup as findActiveByJti, but doesn't filter out a tombstoned
   *  (revoked) entry — only meant for reuse detection in
   *  TokensService.verifyRefreshToken, never as a substitute for
   *  findActiveByJti elsewhere. */
  async findAnyByJti(jti: string): Promise<StoredRefreshToken | null> {
    const raw = await this.redis.get(this.tokenKey(jti));
    return raw ? (JSON.parse(raw) as StoredRefreshToken) : null;
  }

  /** Tombstones rather than deletes — see StoredRefreshToken.revoked for
   *  why. KEEPTTL preserves whatever's left of the original 30-day
   *  expiry set at create(), same pattern OtpRepository.incrementAttempts
   *  already uses for the same reason (extend a record's life without
   *  resetting its clock). */
  async revoke(jti: string): Promise<void> {
    const stored = await this.findActiveByJti(jti);
    if (!stored) return;
    await this.redis.set(
      this.tokenKey(jti),
      JSON.stringify({ ...stored, revoked: true }),
      'KEEPTTL',
    );
    await this.redis.srem(this.userIndexKey(stored.userId), jti);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    const jtis = await this.redis.smembers(this.userIndexKey(userId));
    if (jtis.length === 0) return;
    await this.redis.del(
      ...jtis.map((jti) => this.tokenKey(jti)),
      this.userIndexKey(userId),
    );
  }
}
