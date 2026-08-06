import { Kysely, sql } from 'kysely';

/**
 * The public, unauthenticated marketplace search (GET
 * /marketplace/discovery/tutors, backing every /discover page load and
 * filter change) equality-filters on tutor_subjects.subject_id/
 * curriculum_id and profiles_tutor.verification_status with no
 * supporting index on any of them — a sequential scan on the app's
 * highest-traffic query. Found in a pre-launch audit; purely additive,
 * no data/behavior change.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create index tutor_subjects_subject_id_idx on tutor_subjects(subject_id);
    create index tutor_subjects_curriculum_id_idx on tutor_subjects(curriculum_id);
    create index profiles_tutor_verification_status_idx
      on profiles_tutor(verification_status)
      where verification_status = 'verified';
    create index reviews_student_id_idx on reviews(student_id);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    drop index if exists tutor_subjects_subject_id_idx;
    drop index if exists tutor_subjects_curriculum_id_idx;
    drop index if exists profiles_tutor_verification_status_idx;
    drop index if exists reviews_student_id_idx;
  `.execute(db);
}
