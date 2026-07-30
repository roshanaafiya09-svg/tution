import { Kysely, sql } from 'kysely';

/**
 * Auth implementation tables — not in blueprint §7 (that's domain
 * schema), but required to make WhatsApp OTP + rotating refresh tokens
 * work. Blueprint's target is Redis-backed OTP/jti storage; Postgres is
 * the pragmatic Phase-1 substitute until Redis is wired in, since both
 * are short-lived, low-volume, TTL-shaped data that Postgres handles
 * fine at this scale.
 */
export async function up(db: Kysely<any>): Promise<void> {
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

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists refresh_tokens;`.execute(db);
  await sql`drop table if exists otp_challenges;`.execute(db);
}
