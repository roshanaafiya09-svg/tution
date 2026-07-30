import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CONNECTION } from '../../../database/redis.module';

interface StoredRefreshToken {
  userId: string;
  deviceLabel?: string;
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
    const raw = await this.redis.get(this.tokenKey(jti));
    return raw ? (JSON.parse(raw) as StoredRefreshToken) : null;
  }

  async revoke(jti: string): Promise<void> {
    const stored = await this.findActiveByJti(jti);
    await this.redis.del(this.tokenKey(jti));
    if (stored) {
      await this.redis.srem(this.userIndexKey(stored.userId), jti);
    }
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
