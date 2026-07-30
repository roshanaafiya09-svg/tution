import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { DB } from './types';

export const KYSELY_CONNECTION = 'KYSELY_CONNECTION';

@Global()
@Module({
  providers: [
    {
      provide: KYSELY_CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const pool = new Pool({
          connectionString: config.getOrThrow<string>('database.url'),
          max: 10,
        });

        return new Kysely<DB>({
          dialect: new PostgresDialect({ pool }),
        });
      },
    },
  ],
  exports: [KYSELY_CONNECTION],
})
export class DatabaseModule {}
