import { Kysely, sql } from 'kysely';

/**
 * H4/H11 remediation.
 *
 * 1. class_sessions.cancellation_reason's CHECK constraint only allowed
 *    a single 'manual' value for every non-holiday/non-leave cancel, so
 *    the reminder copy ("...has been cancelled by the academy") could
 *    never tell a teacher-initiated cancel (possibly on a private
 *    Individual class!) apart from an academy-initiated one. Splits
 *    'manual' into 'teacher_manual' / 'academy_manual' going forward —
 *    existing 'manual' rows are left as-is (historical, harmless) rather
 *    than guessed at retroactively; also adds 'batch_archived' for H11's
 *    archive-cascade cancel.
 * 2. class_sessions gets `updated_at`... no — already has it. Adds
 *    nothing else: H4's "edit" only ever touches `meeting_url`, and
 *    "reschedule" only ever touches `scheduled_start_utc`/`duration_min`,
 *    both pre-existing columns.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    alter table class_sessions
      drop constraint class_sessions_cancellation_reason_check;
    alter table class_sessions
      add constraint class_sessions_cancellation_reason_check
      check (cancellation_reason in (
        'government_holiday', 'academy_holiday', 'teacher_leave', 'manual',
        'teacher_manual', 'academy_manual', 'batch_archived'
      ));
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    update class_sessions
      set cancellation_reason = 'manual'
      where cancellation_reason in ('teacher_manual', 'academy_manual', 'batch_archived');
    alter table class_sessions
      drop constraint class_sessions_cancellation_reason_check;
    alter table class_sessions
      add constraint class_sessions_cancellation_reason_check
      check (cancellation_reason in (
        'government_holiday', 'academy_holiday', 'teacher_leave', 'manual'
      ));
  `.execute(db);
}
