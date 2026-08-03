import { Kysely, sql } from 'kysely';

/**
 * AI quiz generator drafts (blueprint §8, Phase 2): "PDF chapter in ->
 * 10 draft MCQs with keys and difficulty. Tutor must review and
 * approve; never auto-publish AI content to students."
 *
 * Deliberately its own schema, not the `quizzes`/`quiz_attempts` tables
 * blueprint §7 lists under Phase 3 — those are the student-facing
 * take-a-quiz/auto-grading tables and don't exist yet. This migration
 * only covers the Phase 2 half: generate -> tutor reviews/edits ->
 * approve or reject. A quiz_draft never becomes visible to a student
 * by itself; Phase 3's delivery tables would reference an approved
 * draft, not replace it.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table quiz_drafts (
      id uuid primary key,
      tutor_id uuid not null references users(id) on delete cascade,
      material_id uuid not null references materials(id) on delete cascade,
      batch_id uuid not null references batches(id) on delete cascade,
      status text not null default 'pending_review'
        check (status in ('pending_review', 'approved', 'rejected')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index quiz_drafts_tutor_id_idx on quiz_drafts(tutor_id);
    create index quiz_drafts_batch_id_idx on quiz_drafts(batch_id);
    create trigger set_updated_at before update on quiz_drafts
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    create table quiz_draft_questions (
      id uuid primary key,
      quiz_draft_id uuid not null references quiz_drafts(id) on delete cascade,
      order_index integer not null,
      question_text text not null,
      choices jsonb not null,
      correct_choice_index integer not null check (correct_choice_index between 0 and 3),
      difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (quiz_draft_id, order_index)
    );
    create trigger set_updated_at before update on quiz_draft_questions
      for each row execute function set_updated_at();
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists quiz_draft_questions;`.execute(db);
  await sql`drop table if exists quiz_drafts;`.execute(db);
}
