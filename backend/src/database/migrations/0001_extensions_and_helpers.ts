import { Kysely, sql } from 'kysely';

/**
 * Shared helper: auto-touches `updated_at` on any table that has the
 * column and attaches this trigger. IDs are UUIDv7, generated
 * application-side (see database/id.ts) — not by Postgres — so managed
 * Postgres providers without custom extensions (Neon at MVP) work fine.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create function set_updated_at() returns trigger as $$
    begin
      new.updated_at = now();
      return new;
    end;
    $$ language plpgsql;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop function if exists set_updated_at();`.execute(db);
}
