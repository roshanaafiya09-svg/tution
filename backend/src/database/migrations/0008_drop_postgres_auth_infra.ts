import { Kysely, sql } from 'kysely';

/**
 * Superseded by Redis (blueprint §6 target). otp_challenges and
 * refresh_tokens from migration 0007 are TTL-shaped, high-churn data
 * that belongs in Redis, not Postgres — never edit an already-applied
 * migration, so this un-does 0007 instead of rewriting it.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists refresh_tokens;`.execute(db);
  await sql`drop table if exists otp_challenges;`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    create table otp_challenges (
      id uuid primary key,
      phone_e164 text not null,
      code_hash text not null,
      purpose text not null default 'login' check (purpose in ('login')),
      attempts integer not null default 0,
      expires_at timestamptz not null,
      consumed_at timestamptz null,
      created_at timestamptz not null default now()
    );
    create index otp_challenges_phone_e164_idx on otp_challenges(phone_e164);
  `.execute(db);

  await sql`
    create table refresh_tokens (
      id uuid primary key,
      user_id uuid not null references users(id) on delete cascade,
      jti text not null unique,
      device_label text null,
      expires_at timestamptz not null,
      revoked_at timestamptz null,
      created_at timestamptz not null default now()
    );
    create index refresh_tokens_user_id_idx on refresh_tokens(user_id);
  `.execute(db);
}
