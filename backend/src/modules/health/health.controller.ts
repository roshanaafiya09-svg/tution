import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../database/database.module';
import type { DB } from '../../database/types';

@Controller('health')
export class HealthController {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  @Get()
  async check() {
    try {
      await sql`select 1`.execute(this.db);
      return { status: 'ok', database: 'up', timestamp: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'down',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
