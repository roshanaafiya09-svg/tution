import { Kysely, sql } from 'kysely';

/**
 * Student-facing quiz-taking (blueprint §7/§10 Phase 3): a tutor
 * "publishes" an approved quiz_draft (see 0016) into an immutable
 * `quizzes`/`quiz_questions` snapshot that students in the batch can
 * take, auto-graded via `quiz_attempts`. Publishing is a distinct step
 * from approval — approval only certifies the AI content is correct;
 * publishing is the tutor's decision to release it to students now.
 * One attempt per student per quiz (no retakes in this scope, matching
 * the MVP "MCQ auto-graded" cut, not the richer resit flows assignments
 * might eventually need).
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table quizzes (
      id uuid primary key,
      quiz_draft_id uuid not null unique references quiz_drafts(id) on delete cascade,
      batch_id uuid not null references batches(id) on delete cascade,
      tutor_id uuid not null references users(id) on delete cascade,
      title text not null,
      created_at timestamptz not null default now()
    );
    create index quizzes_batch_id_idx on quizzes(batch_id);
  `.execute(db);

  await sql`
    create table quiz_questions (
      id uuid primary key,
      quiz_id uuid not null references quizzes(id) on delete cascade,
      order_index integer not null,
      question_text text not null,
      choices jsonb not null,
      correct_choice_index integer not null check (correct_choice_index between 0 and 3),
      difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
      unique (quiz_id, order_index)
    );
  `.execute(db);

  await sql`
    create table quiz_attempts (
      id uuid primary key,
      quiz_id uuid not null references quizzes(id) on delete cascade,
      student_id uuid not null references users(id) on delete cascade,
      answers jsonb not null,
      score integer not null check (score >= 0),
      total integer not null check (total > 0),
      submitted_at timestamptz not null default now(),
      unique (quiz_id, student_id)
    );
    create index quiz_attempts_student_id_idx on quiz_attempts(student_id);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists quiz_attempts;`.execute(db);
  await sql`drop table if exists quiz_questions;`.execute(db);
  await sql`drop table if exists quizzes;`.execute(db);
}
