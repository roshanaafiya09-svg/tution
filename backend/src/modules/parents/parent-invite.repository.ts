import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CONNECTION } from '../../database/redis.module';

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Same shape of problem as OTP challenges (see otp.repository.ts):
 * short-lived, single-use, high-churn — lives in Redis rather than
 * Postgres. The token never becomes a parent_child_links row until a
 * parent actually redeems it, so there's nothing worth persisting
 * relationally while it's outstanding.
 */
@Injectable()
export class ParentInviteRepository {
  constructor(@Inject(REDIS_CONNECTION) private readonly redis: Redis) {}

  private key(token: string): string {
    return `parent-invite:${token}`;
  }

  async create(token: string, studentId: string): Promise<void> {
    await this.redis.set(this.key(token), studentId, 'EX', TTL_SECONDS);
  }

  findStudentId(token: string): Promise<string | null> {
    return this.redis.get(this.key(token));
  }

  async consume(token: string): Promise<void> {
    await this.redis.del(this.key(token));
  }
}
