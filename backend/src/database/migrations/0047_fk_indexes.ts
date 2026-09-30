import { Kysely, sql } from 'kysely';

/**
 * Audit finding L4: 34 foreign-key columns had no index, so every join or
 * cascade delete through them does a sequential scan — fine on today's
 * small dataset, increasingly expensive as it grows. Plain (non-concurrent)
 * indexes are safe here: the migration runner wraps each migration in a
 * transaction, which `CREATE INDEX CONCURRENTLY` cannot run inside, and the
 * current tables are small enough that a brief lock is not a concern.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create index academy_announcements_audience_batch_id_idx on academy_announcements(audience_batch_id);
    create index academy_announcements_audience_student_id_idx on academy_announcements(audience_student_id);
    create index academy_announcements_audience_teacher_id_idx on academy_announcements(audience_teacher_id);
    create index academy_announcements_created_by_idx on academy_announcements(created_by);
    create index academy_contact_requests_requester_id_idx on academy_contact_requests(requester_id);
    create index academy_kyc_verifications_consent_record_id_idx on academy_kyc_verifications(consent_record_id);
    create index academy_kyc_verifications_reviewed_by_idx on academy_kyc_verifications(reviewed_by);
    create index academy_reviews_student_id_idx on academy_reviews(student_id);
    create index ai_interactions_parent_id_idx on ai_interactions(parent_id);
    create index announcements_tutor_id_idx on announcements(tutor_id);
    create index assessment_results_batch_id_idx on assessment_results(batch_id);
    create index assessment_scorecard_imports_uploaded_by_idx on assessment_scorecard_imports(uploaded_by);
    create index assessments_subject_id_idx on assessments(subject_id);
    create index attendance_marked_by_idx on attendance(marked_by);
    create index batches_grade_level_id_idx on batches(grade_level_id);
    create index batches_subject_id_idx on batches(subject_id);
    create index booking_waitlists_converted_booking_id_idx on booking_waitlists(converted_booking_id);
    create index bookings_subject_id_idx on bookings(subject_id);
    create index class_sessions_recurrence_parent_id_idx on class_sessions(recurrence_parent_id);
    create index class_sessions_substitute_tutor_id_idx on class_sessions(substitute_tutor_id);
    create index digests_student_id_idx on digests(student_id);
    create index holidays_created_by_idx on holidays(created_by);
    create index invites_tutor_id_idx on invites(tutor_id);
    create index material_chunks_tutor_id_idx on material_chunks(tutor_id);
    create index materials_tutor_id_idx on materials(tutor_id);
    create index messages_sender_id_idx on messages(sender_id);
    create index messages_student_id_idx on messages(student_id);
    create index parent_child_links_consent_record_id_idx on parent_child_links(consent_record_id);
    create index profiles_student_curriculum_id_idx on profiles_student(curriculum_id);
    create index quiz_drafts_material_id_idx on quiz_drafts(material_id);
    create index quizzes_tutor_id_idx on quizzes(tutor_id);
    create index teacher_attendance_marked_by_idx on teacher_attendance(marked_by);
    create index teacher_contact_requests_requester_id_idx on teacher_contact_requests(requester_id);
    create index teacher_leave_requests_decided_by_idx on teacher_leave_requests(decided_by);
    create index tutor_verifications_reviewed_by_idx on tutor_verifications(reviewed_by);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    drop index if exists academy_announcements_audience_batch_id_idx;
    drop index if exists academy_announcements_audience_student_id_idx;
    drop index if exists academy_announcements_audience_teacher_id_idx;
    drop index if exists academy_announcements_created_by_idx;
    drop index if exists academy_contact_requests_requester_id_idx;
    drop index if exists academy_kyc_verifications_consent_record_id_idx;
    drop index if exists academy_kyc_verifications_reviewed_by_idx;
    drop index if exists academy_reviews_student_id_idx;
    drop index if exists ai_interactions_parent_id_idx;
    drop index if exists announcements_tutor_id_idx;
    drop index if exists assessment_results_batch_id_idx;
    drop index if exists assessment_scorecard_imports_uploaded_by_idx;
    drop index if exists assessments_subject_id_idx;
    drop index if exists attendance_marked_by_idx;
    drop index if exists batches_grade_level_id_idx;
    drop index if exists batches_subject_id_idx;
    drop index if exists booking_waitlists_converted_booking_id_idx;
    drop index if exists bookings_subject_id_idx;
    drop index if exists class_sessions_recurrence_parent_id_idx;
    drop index if exists class_sessions_substitute_tutor_id_idx;
    drop index if exists digests_student_id_idx;
    drop index if exists holidays_created_by_idx;
    drop index if exists invites_tutor_id_idx;
    drop index if exists material_chunks_tutor_id_idx;
    drop index if exists materials_tutor_id_idx;
    drop index if exists messages_sender_id_idx;
    drop index if exists messages_student_id_idx;
    drop index if exists parent_child_links_consent_record_id_idx;
    drop index if exists profiles_student_curriculum_id_idx;
    drop index if exists quiz_drafts_material_id_idx;
    drop index if exists quizzes_tutor_id_idx;
    drop index if exists teacher_attendance_marked_by_idx;
    drop index if exists teacher_contact_requests_requester_id_idx;
    drop index if exists teacher_leave_requests_decided_by_idx;
    drop index if exists tutor_verifications_reviewed_by_idx;
  `.execute(db);
}
