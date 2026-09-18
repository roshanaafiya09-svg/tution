import { Kysely, sql } from 'kysely';

/**
 * Assessment overhaul: replaces the Teacher-facing "Quizzes" feature with
 * "Assessment" (Online + Offline), where one assessment can be delivered to
 * MANY batches at once (not one assessment per batch). Deliberately a new,
 * parallel schema — NOT a retrofit of quiz_drafts/quizzes/quiz_questions/
 * quiz_attempts (migrations 0016/0017), which are hard-wired to a single
 * batch_id at every layer and have no concept of marks, offline delivery, a
 * mandatory question paper, or weekly compliance. Those tables and their
 * data are left completely untouched.
 *
 * assessment_batches mirrors holiday_batches' (0035) join-table shape: a
 * composite primary key is the uniqueness constraint, no separate id/unique
 * index needed.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table assessments (
      id uuid primary key,
      tutor_id uuid not null references users(id) on delete cascade,
      mode text not null check (mode in ('online', 'offline')),
      title text not null,
      subject_id uuid not null references subjects(id) on delete restrict,
      status text not null default 'draft'
        check (status in ('draft', 'scheduled', 'published', 'scorecard_pending', 'completed', 'overdue')),
      max_score integer null check (max_score is null or max_score > 0),
      question_paper_object_key text null,
      question_paper_mime text null,
      assessment_date date null,
      scorecard_deadline_at timestamptz null,
      available_until timestamptz null,
      week_start_date date not null,
      published_at timestamptz null,
      completed_at timestamptz null,
      completed_late boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint assessments_offline_requires_date
        check (mode <> 'offline' or assessment_date is not null)
    );
    create index assessments_tutor_id_idx on assessments(tutor_id);
    create index assessments_week_start_date_idx on assessments(week_start_date);
    create index assessments_status_idx on assessments(status);
    create trigger set_updated_at before update on assessments
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    create table assessment_batches (
      assessment_id uuid not null references assessments(id) on delete cascade,
      batch_id uuid not null references batches(id) on delete cascade,
      primary key (assessment_id, batch_id)
    );
    create index assessment_batches_batch_id_idx on assessment_batches(batch_id);
  `.execute(db);

  await sql`
    create table assessment_questions (
      id uuid primary key,
      assessment_id uuid not null references assessments(id) on delete cascade,
      order_index integer not null,
      question_text text not null,
      choices jsonb not null,
      correct_choice_index integer not null check (correct_choice_index between 0 and 3),
      marks integer not null check (marks > 0),
      difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
      explanation text null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (assessment_id, order_index)
    );
    create trigger set_updated_at before update on assessment_questions
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    create table assessment_results (
      id uuid primary key,
      assessment_id uuid not null references assessments(id) on delete cascade,
      batch_id uuid not null references batches(id) on delete cascade,
      student_id uuid not null references users(id) on delete cascade,
      score integer not null check (score >= 0),
      max_score integer not null check (max_score > 0),
      source text not null check (source in ('online_submission', 'offline_scorecard')),
      answers jsonb null,
      submitted_at timestamptz not null default now(),
      unique (assessment_id, student_id),
      constraint assessment_results_score_within_max check (score <= max_score)
    );
    create index assessment_results_student_id_idx on assessment_results(student_id);
    create index assessment_results_assessment_id_idx on assessment_results(assessment_id);
  `.execute(db);

  await sql`
    create table assessment_scorecard_imports (
      id uuid primary key,
      assessment_id uuid not null references assessments(id) on delete cascade,
      uploaded_by uuid not null references users(id) on delete cascade,
      status text not null check (status in ('success', 'failed')),
      error_detail jsonb null,
      row_count integer not null default 0,
      created_at timestamptz not null default now()
    );
    create index assessment_scorecard_imports_assessment_id_idx
      on assessment_scorecard_imports(assessment_id);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists assessment_scorecard_imports;`.execute(db);
  await sql`drop table if exists assessment_results;`.execute(db);
  await sql`drop table if exists assessment_questions;`.execute(db);
  await sql`drop table if exists assessment_batches;`.execute(db);
  await sql`drop table if exists assessments;`.execute(db);
}
