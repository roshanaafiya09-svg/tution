import { Kysely, sql } from 'kysely';

/**
 * Academy Dashboard > Communication > Announcements. Deliberately a NEW
 * table, not an extension of the existing `announcements` table
 * (migration 0016-era, tutor-authored/single-batch/always-published,
 * read by students at /student/announcements) — that shape doesn't fit
 * an academy-wide, multi-audience, draft/publish/archive broadcast
 * authored by the academy owner, and retrofitting it would be an
 * invasive change to a shipped student-facing feature for no real gain.
 * Same reasoning this codebase already applied keeping `holidays`
 * separate from `teacher_leave_requests` despite both cancelling
 * sessions.
 *
 * `audience_type` picks exactly one recipient scope; the three nullable
 * target columns are only ever set for the matching scope ('batch' /
 * 'teacher' / 'student') — the cross-column check below keeps the two
 * in sync at the DB level rather than trusting application code alone.
 * `recipient_count`/`published_at` are set once, atomically, by the
 * publish transition (`status='draft' -> 'published'` guarded by a
 * `where status = 'draft'` on the update, not read-then-write) — see
 * AcademyOwnerAnnouncementsService.publish for why a plain read-then-
 * write would risk double-notifying an entire academy on a concurrent
 * double-publish.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table academy_announcements (
      id uuid primary key,
      academy_id uuid not null references academies(id) on delete cascade,
      created_by uuid not null references users(id) on delete cascade,
      title text not null,
      body text not null,
      audience_type text not null check (audience_type in (
        'academy', 'teachers', 'students', 'parents', 'batch', 'teacher', 'student'
      )),
      audience_batch_id uuid null references batches(id) on delete set null,
      audience_teacher_id uuid null references users(id) on delete set null,
      audience_student_id uuid null references users(id) on delete set null,
      status text not null default 'draft'
        check (status in ('draft', 'published', 'archived')),
      recipient_count integer null,
      published_at timestamptz null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (
        (audience_type = 'batch' and audience_batch_id is not null
          and audience_teacher_id is null and audience_student_id is null)
        or (audience_type = 'teacher' and audience_teacher_id is not null
          and audience_batch_id is null and audience_student_id is null)
        or (audience_type = 'student' and audience_student_id is not null
          and audience_batch_id is null and audience_teacher_id is null)
        or (audience_type in ('academy', 'teachers', 'students', 'parents')
          and audience_batch_id is null and audience_teacher_id is null
          and audience_student_id is null)
      )
    );
    create index academy_announcements_academy_status_created_idx
      on academy_announcements(academy_id, status, created_at desc);
    create trigger set_updated_at before update on academy_announcements
      for each row execute function set_updated_at();
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists academy_announcements;`.execute(db);
}
