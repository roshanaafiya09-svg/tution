import { Kysely, sql } from 'kysely';

/**
 * AI doubt solver (blueprint §8/§10 Phase 3): RAG over a tutor's own
 * materials. `material_chunks` holds embedded PDF text (pgvector,
 * cosine similarity via HNSW — fine at this scale, no ivfflat list
 * tuning needed). `ai_interactions` is the Socratic-gate audit trail:
 * a 'hint' row is created on every question (never the final answer);
 * a 'full_answer' row is created only when the student submits their
 * own attempt first, linked back via parent_id. This table is also
 * where the per-student monthly token budget (blueprint §5 unit-
 * economics guardrail) and the safeguarding-review log (§8 guardrails)
 * both read from — every AI interaction, logged, no exceptions.
 *
 * Embedding dimension (1024) is tied to the real provider's model
 * (Voyage AI's voyage-3) — changing embedding models later means a
 * new column + backfill, not a type change.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`create extension if not exists vector;`.execute(db);

  await sql`
    create table material_chunks (
      id uuid primary key,
      material_id uuid not null references materials(id) on delete cascade,
      batch_id uuid not null references batches(id) on delete cascade,
      tutor_id uuid not null references users(id) on delete cascade,
      chunk_index integer not null,
      content text not null,
      embedding vector(1024) not null,
      created_at timestamptz not null default now(),
      unique (material_id, chunk_index)
    );
    create index material_chunks_batch_id_idx on material_chunks(batch_id);
    create index material_chunks_embedding_idx on material_chunks
      using hnsw (embedding vector_cosine_ops);
  `.execute(db);

  await sql`
    create table ai_interactions (
      id uuid primary key,
      student_id uuid not null references users(id) on delete cascade,
      batch_id uuid not null references batches(id) on delete cascade,
      parent_id uuid null references ai_interactions(id) on delete cascade,
      kind text not null check (kind in ('hint', 'full_answer')),
      question_text text not null,
      answer_text text not null,
      citations jsonb not null default '[]',
      flagged boolean not null default false,
      input_tokens integer not null default 0,
      output_tokens integer not null default 0,
      created_at timestamptz not null default now()
    );
    create index ai_interactions_student_id_created_at_idx
      on ai_interactions(student_id, created_at);
    create index ai_interactions_batch_id_idx on ai_interactions(batch_id);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists ai_interactions;`.execute(db);
  await sql`drop table if exists material_chunks;`.execute(db);
  await sql`drop extension if exists vector;`.execute(db);
}
