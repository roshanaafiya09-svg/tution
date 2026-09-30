import { Kysely, sql } from 'kysely';

/**
 * Audit finding M3(c): the overlap check for a new/rescheduled class
 * (SessionsService.assertNoConflicts) is a plain SELECT before the INSERT/
 * UPDATE — no lock, no transaction spanning both — so two concurrent
 * requests for the same colliding slot both see "no conflict" and both
 * succeed. Only the database can close that window. `EXCLUDE` constraints
 * enforce it directly on `class_sessions`: no two 'scheduled' rows for the
 * same tutor, and no two for the same batch, may have overlapping
 * [scheduled_start_utc, scheduled_start_utc + duration_min) ranges. This
 * also covers SessionsService.rescheduleSession's identical check-then-act
 * gap for free, since EXCLUDE is enforced on UPDATE the same as INSERT.
 *
 * Requires `btree_gist` for a plain-equality column (tutor_id/batch_id)
 * to participate in a GiST exclusion index alongside a range column —
 * already confirmed available on this project's Postgres (Neon).
 *
 * `timestamptz + interval` is only STABLE in Postgres (conservatively, in
 * case DST/zone rules ever affected it), and an index expression must be
 * IMMUTABLE — hence the wrapper function below, explicitly marked
 * IMMUTABLE: comparing two timestamptz instants for overlap never actually
 * depends on timezone (the stored value is already a UTC instant), so this
 * is safe.
 *
 * Deploying this to an environment with existing overlapping 'scheduled'
 * rows will fail; check for and resolve any first (see the repository's
 * deployment/migration docs).
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create extension if not exists btree_gist;

    create function class_session_range(start_ts timestamptz, duration_min int)
    returns tstzrange as $$
      select tstzrange(start_ts, start_ts + (duration_min * interval '1 minute'));
    $$ language sql immutable;

    alter table class_sessions add constraint class_sessions_no_tutor_overlap
      exclude using gist (
        tutor_id with =,
        class_session_range(scheduled_start_utc, duration_min) with &&
      )
      where (status = 'scheduled');

    alter table class_sessions add constraint class_sessions_no_batch_overlap
      exclude using gist (
        batch_id with =,
        class_session_range(scheduled_start_utc, duration_min) with &&
      )
      where (status = 'scheduled');
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    alter table class_sessions drop constraint if exists class_sessions_no_tutor_overlap;
    alter table class_sessions drop constraint if exists class_sessions_no_batch_overlap;
    drop function if exists class_session_range(timestamptz, int);
  `.execute(db);
}
