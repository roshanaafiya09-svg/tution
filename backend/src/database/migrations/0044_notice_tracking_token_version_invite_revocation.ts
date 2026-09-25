import { Kysely, sql } from 'kysely';

/**
 * Follow-up to the H4/H8 remediation (0042/0043). All three columns are
 * additive and nullable/defaulted, so existing rows and every existing
 * query are unaffected.
 *
 * 1. class_sessions.cancellation_notified_at (H4) — set once students/
 *    parents have been told about a teacher/academy/archive cancellation
 *    the moment it happened. The 10-minutes-before cancelled-class sweep
 *    skips a row that carries it, so the same cancellation is never
 *    announced twice; a row cancelled before this column existed (or whose
 *    immediate notice failed) stays NULL and still gets the sweep as its
 *    one notice.
 *
 * 2. users.token_version (H8) — the durable source of truth for "which
 *    access tokens are still valid". Every access JWT carries the version
 *    it was issued under; deleting an account bumps it, so a token issued
 *    before the deletion no longer matches. Redis only caches the value —
 *    losing the cache falls back to this column, it can't resurrect a
 *    revoked token (the earlier Redis-only flag could).
 *
 * 3. invites.revoked_at (H8) — set on every invite a teacher created when
 *    their account is deleted, so an old link can no longer enroll anyone.
 *    Recorded explicitly rather than by back-dating expires_at, so an
 *    invite's real expiry stays historically accurate.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    alter table class_sessions add column cancellation_notified_at timestamptz null;
    alter table users add column token_version integer not null default 0;
    alter table invites add column revoked_at timestamptz null;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    alter table invites drop column if exists revoked_at;
    alter table users drop column if exists token_version;
    alter table class_sessions drop column if exists cancellation_notified_at;
  `.execute(db);
}
