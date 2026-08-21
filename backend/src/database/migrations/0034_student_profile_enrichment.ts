import { Kysely, sql } from 'kysely';

/**
 * Student Profile (Student Dashboard redesign spec §14): enriches
 * profiles_student with the extra fields a student's own profile page
 * wants to show — subjects, languages, location, preferred teaching mode,
 * and learning goals. Mirrors 0029_teacher_profile_and_contact_requests.ts's
 * additive shape applied to profiles_student instead of profiles_tutor.
 * Deliberately excludes a photo/avatar column — that needs its own
 * upload-flow work (storage + presigned URL, same as profiles_tutor's
 * avatar_object_key), out of scope for this pass.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    alter table profiles_student
      add column subjects jsonb,
      add column languages jsonb,
      add column location text,
      add column teaching_mode text
        check (teaching_mode in ('online', 'offline', 'both')),
      add column learning_goals text;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    alter table profiles_student
      drop column if exists subjects,
      drop column if exists languages,
      drop column if exists location,
      drop column if exists teaching_mode,
      drop column if exists learning_goals;
  `.execute(db);
}
