import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table device_tokens (
      id uuid primary key,
      user_id uuid not null references users(id) on delete cascade,
      token text not null,
      platform text not null default 'android' check (platform in ('android', 'ios')),
      created_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now(),
      unique (token)
    );
    create index device_tokens_user_id_idx on device_tokens(user_id);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists device_tokens;`.execute(db);
}
