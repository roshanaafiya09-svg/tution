import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type Redis from 'ioredis';
import { KYSELY_CONNECTION } from '../../database/database.module';
import { REDIS_CONNECTION } from '../../database/redis.module';
import type { DB } from '../../database/types';

/** Render polls this on its own schedule to decide container health —
 *  exempt from the global throttle so rate limiting can never itself
 *  cause a false "unhealthy" verdict and restart loop. */
@SkipThrottle({ default: true })
@Controller('health')
export class HealthController {
  constructor(
    @Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>,
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
  ) {}

  @Get()
  async check() {
    const [dbUp, redisUp] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
    ]);

    if (!dbUp || !redisUp) {
      throw new ServiceUnavailableException({
        status: 'error',
        database: dbUp ? 'up' : 'down',
        redis: redisUp ? 'up' : 'down',
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: 'ok',
      database: 'up',
      redis: 'up',
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDb(): Promise<boolean> {
    try {
      await sql`select 1`.execute(this.db);
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
