import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { Kysely, PostgresDialect } from 'kysely';
import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration';
import { Pool } from 'pg';
import 'dotenv/config';

/**
 * Loads .ts migration files via require() instead of Kysely's built-in
 * FileMigrationProvider, which uses dynamic import() — that fails under
 * ts-node on Windows because Node's ESM loader rejects raw drive-letter
 * paths (needs a file:// URL). require() has no such restriction.
 */
class TsRequireMigrationProvider implements MigrationProvider {
  constructor(private readonly migrationFolder: string) {}

  async getMigrations(): Promise<Record<string, Migration>> {
    const files = (await fs.readdir(this.migrationFolder)).filter((f) =>
      f.endsWith('.ts'),
    );
    const migrations: Record<string, Migration> = {};
    for (const file of files) {
      const name = file.replace(/\.ts$/, '');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      migrations[name] = require(path.join(this.migrationFolder, file));
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

  const db = new Kysely<any>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: databaseUrl }),
    }),
  });

  const migrator = new Migrator({
    db,
    provider: new TsRequireMigrationProvider(path.join(__dirname, 'migrations')),
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

run();
