import { Kysely, sql } from 'kysely';

/**
 * Teacher Attendance (separate from the existing student-facing
 * `attendance` table). Scheduled ≠ Present: a `class_sessions` row only
 * proves a teacher was expected to teach, never that they showed up, so
 * this table is the explicit, admin-recorded source of truth for teacher
 * presence — `present`/`absent` only. Approved Leave, Holiday, and
 * Cancelled are deliberately NEVER stored here; they're derived at read
 * time from `class_sessions.status`/`cancellation_reason`/
 * `substitute_tutor_id` (the same columns migration 0035 already added),
 * exactly mirroring the existing invariant that a cancelled session never
 * gets a student attendance row either.
 *
 * `unique (session_id)` — at most one attendance record per session.
 * `tutor_id` always equals `class_sessions.tutor_id` (the session's own
 * assigned teacher): a session that already has a `substitute_tutor_id`
 * assigned is not open to marking at all — it's conclusively Approved
 * Leave for the original teacher, so there's nothing to record here (see
 * AcademyOwnerTeacherAttendanceService.markAttendance).
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table teacher_attendance (
      id uuid primary key,
      session_id uuid not null references class_sessions(id) on delete cascade,
      tutor_id uuid not null references users(id) on delete cascade,
      status text not null check (status in ('present', 'absent')),
      marked_by uuid not null references users(id) on delete restrict,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (session_id)
    );
    create index teacher_attendance_tutor_id_idx on teacher_attendance(tutor_id);
    create trigger set_updated_at before update on teacher_attendance
      for each row execute function set_updated_at();
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists teacher_attendance;`.execute(db);
}
