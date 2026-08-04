import { Kysely, sql } from 'kysely';

/**
 * Verified-session-only reviews (blueprint §10 Phase 4) — a student can
 * only review a tutor they've actually had a session with (batch
 * attendance or a completed 1:1 booking; enforced in ReviewsService, not
 * here). One review per (tutor_id, student_id) — a repeat review updates
 * the existing row rather than stacking duplicates, same one-per-reviewer
 * convention as most marketplace review systems.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table reviews (
      id uuid primary key,
      tutor_id uuid not null references users(id) on delete cascade,
      student_id uuid not null references users(id) on delete cascade,
      rating smallint not null check (rating between 1 and 5),
      comment text null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tutor_id, student_id)
    );
    create index reviews_tutor_id_idx on reviews(tutor_id);
    create trigger set_updated_at before update on reviews
      for each row execute function set_updated_at();
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists reviews;`.execute(db);
}
