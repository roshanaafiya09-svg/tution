import { Kysely, sql } from 'kysely';

/**
 * Monitored-only adult<->minor messaging (blueprint §9): "No unmonitored
 * adult<->minor DM. Ever." A thread is keyed by (batch_id, student_id),
 * not by a sender/recipient pair — every message in it is visible to
 * the tutor, the student, and any consented parent of that student, by
 * construction. There is no way to open a private 1:1 channel that
 * excludes one of those three roles.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table messages (
      id uuid primary key,
      batch_id uuid not null references batches(id) on delete cascade,
      student_id uuid not null references users(id) on delete cascade,
      sender_id uuid not null references users(id),
      sender_role text not null check (sender_role in ('tutor', 'student', 'parent')),
      body text not null,
      created_at timestamptz not null default now()
    );
    create index messages_thread_idx on messages(batch_id, student_id, created_at);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists messages;`.execute(db);
}
