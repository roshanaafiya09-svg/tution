import { Kysely, sql } from 'kysely';

/**
 * Teacher Profile + Find a Teacher (blueprint-adjacent, not in the
 * original phased blueprint): enriches profiles_tutor with the extra
 * public-profile fields that don't already exist elsewhere (photo,
 * qualifications, languages, teaching mode, methodology, achievements,
 * certifications, a fee note), plus a small table backing the "Contact
 * Teacher" lead list shown on the tutor's existing Marketplace page.
 * Subjects/rates, availability, location, verification, and reviews
 * already have their own tables — this migration deliberately doesn't
 * duplicate any of those.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    alter table profiles_tutor
      add column avatar_object_key text,
      add column qualifications text,
      add column languages jsonb,
      add column teaching_mode text
        check (teaching_mode in ('online', 'offline', 'both')),
      add column methodology text,
      add column achievements text,
      add column certifications text,
      add column fee_note text;
  `.execute(db);

  await sql`
    create table teacher_contact_requests (
      id uuid primary key,
      tutor_id uuid not null references users(id) on delete cascade,
      requester_id uuid not null references users(id) on delete cascade,
      requester_role text not null check (requester_role in ('student', 'parent')),
      message text null,
      read_at timestamptz null,
      created_at timestamptz not null default now()
    );
    create index teacher_contact_requests_tutor_id_idx on teacher_contact_requests(tutor_id);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists teacher_contact_requests;`.execute(db);
  await sql`
    alter table profiles_tutor
      drop column if exists avatar_object_key,
      drop column if exists qualifications,
      drop column if exists languages,
      drop column if exists teaching_mode,
      drop column if exists methodology,
      drop column if exists achievements,
      drop column if exists certifications,
      drop column if exists fee_note;
  `.execute(db);
}
