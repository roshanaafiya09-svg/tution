import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { Kysely, PostgresDialect } from 'kysely';
import {
  Migrator,
  type Migration,
  type MigrationProvider,
} from 'kysely/migration';
import { Pool } from 'pg';
import 'dotenv/config';
import type { DB } from './types';

/**
 * Loads migration files via require() instead of Kysely's built-in
 * FileMigrationProvider, which uses dynamic import() — that fails under
 * ts-node on Windows because Node's ESM loader rejects raw drive-letter
 * paths (needs a file:// URL). require() has no such restriction.
 *
 * Matches this file's own extension rather than hardcoding `.ts`: under
 * `ts-node src/database/migrate.ts` (local dev) __filename is `.ts` and
 * migrations are required as `.ts` too; under the compiled production
 * runtime (`node dist/database/migrate.js`) __filename is `.js` and
 * `nest build` has already compiled every migration alongside it. A
 * hardcoded `.ts` filter finds nothing runnable in the compiled
 * output — every migration file there is `.js` (`.d.ts` declaration
 * files also happen to satisfy `endsWith('.ts')`, which would crash
 * `require()` under plain Node instead of silently doing nothing).
 */
class TsRequireMigrationProvider implements MigrationProvider {
  constructor(private readonly migrationFolder: string) {}

  async getMigrations(): Promise<Record<string, Migration>> {
    const ext = path.extname(__filename);
    const files = (await fs.readdir(this.migrationFolder)).filter((f) =>
      f.endsWith(ext),
    );
    const migrations: Record<string, Migration> = {};
    for (const file of files) {
      const name = file.slice(0, -ext.length);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      migrations[name] = require(
        path.join(this.migrationFolder, file),
      ) as Migration;
    }
    return migrations;
  }
}

const direction = process.argv[2];
if (direction !== 'up' && direction !== 'down') {
  console.error('Usage: ts-node src/database/migrate.ts <up|down>');
  process.exit(1);
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Copy backend/.env.example to backend/.env first.',
    );
  }

  // See database.module.ts for why this is explicit rather than relying on
  // sslmode in the connection string — same reasoning applies here since
  // this pool also runs against production (Dockerfile CMD runs this
  // before the app boots, see 0034's migration history).
  const db = new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: databaseUrl,
        ssl:
          process.env.NODE_ENV === 'production'
            ? { rejectUnauthorized: true }
            : undefined,
      }),
    }),
  });

  const migrator = new Migrator({
    db,
    provider: new TsRequireMigrationProvider(
      path.join(__dirname, 'migrations'),
    ),
  });

  const { error, results } =
    direction === 'up'
      ? await migrator.migrateToLatest()
      : await migrator.migrateDown();

  for (const result of results ?? []) {
    const label = `${result.direction} ${result.migrationName}`;
    if (result.status === 'Success') {
      console.log(`✓ ${label}`);
    } else if (result.status === 'Error') {
      console.error(`✗ ${label}`);
    }
  }

  await db.destroy();

  if (error) {
    console.error(error);
    process.exit(1);
  }
}

void run();
