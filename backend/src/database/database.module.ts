import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { DB } from './types';
import { configurePgTypeParsers } from './pg-types';

export const KYSELY_CONNECTION = 'KYSELY_CONNECTION';

configurePgTypeParsers();

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
          // Neon rejects unencrypted connections outright, so transport is
          // already encrypted regardless of this option — but without an
          // explicit `ssl` config, verification of *which* server we're
          // encrypting to depends entirely on the DATABASE_URL string
          // happening to carry the right sslmode. rejectUnauthorized: true
          // makes Node's TLS layer validate the server certificate's chain
          // and hostname itself (equivalent to Postgres's sslmode=verify-full,
          // Neon's own recommended mode) — code-enforced, not
          // connection-string-dependent. Neon's certs chain to Let's
          // Encrypt's ISRG Root X1, which ships in Node's default trusted
          // root store, so no custom CA bundle is needed. Skipped outside
          // production so local dev against docker-compose's plain
          // Postgres (no TLS at all) keeps working.
          ssl:
            process.env.NODE_ENV === 'production'
              ? { rejectUnauthorized: true }
              : undefined,
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
