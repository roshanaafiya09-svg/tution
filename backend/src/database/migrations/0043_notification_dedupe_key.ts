import { Kysely, sql } from 'kysely';

/**
 * H7 hardening. Reminder-cron dedupe was pure app-level "read recent
 * rows, check if one matches, then insert" — safe on today's
 * single-instance deployment (confirmed via render.yaml: one web
 * service, no worker/cron service block) but with no atomicity backing
 * it. A `dedupe_key`, set only by callers that want this guarantee
 * (RemindersService), plus a partial unique index, turns "duplicate
 * insert" into a safe `ON CONFLICT DO NOTHING` instead of relying
 * solely on the read-then-write race window. Nullable and unindexed for
 * every other caller of NotificationsService.notify — this is opt-in,
 * not a behavior change for the rest of the app.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    alter table notifications add column dedupe_key text null;
    create unique index notifications_user_type_dedupe_key_idx
      on notifications(user_id, type, dedupe_key)
      where dedupe_key is not null;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    drop index if exists notifications_user_type_dedupe_key_idx;
    alter table notifications drop column if exists dedupe_key;
  `.execute(db);
}
