import { Kysely, sql } from 'kysely';

/**
 * Closes the gap migration 0030 explicitly left open: a self-serve
 * Academy Dashboard/owner role. Three additive changes:
 *
 *  1. `'academy'` is added to the `user_roles.role` CHECK constraint.
 *     The constraint from migration 0002 was declared inline with no
 *     explicit name, so Postgres auto-assigned one — looked up
 *     dynamically via pg_constraint rather than guessed, so this can't
 *     silently no-op against a differently-named constraint.
 *  2. `academies.owner_user_id` links an academy to the one user who can
 *     manage it (1 academy : 1 owner-user) — every /academy/* endpoint
 *     resolves "my academy" from this column keyed off the caller's own
 *     id, which is what makes cross-academy access impossible.
 *  3. `academy_membership_requests` is a NEW leaf table, deliberately
 *     separate from `academy_memberships` (which stays exactly
 *     'active'/'left', untouched) — same one-table-per-concern pattern
 *     as academy_contact_requests. A tutor requests to join; the
 *     academy accepts (inserts an academy_memberships row via the
 *     existing repository) or rejects (this table only). Joining an
 *     academy NEVER touches users/profiles_tutor/tutor_subjects/
 *     batches/bookings/reviews — see this feature's plan doc, "hard
 *     invariant" section.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    do $$
    declare
      cname text;
    begin
      select con.conname into cname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      where rel.relname = 'user_roles' and con.contype = 'c';
      if cname is not null then
        execute format('alter table user_roles drop constraint %I', cname);
      end if;
    end $$;
  `.execute(db);

  await sql`
    alter table user_roles add constraint user_roles_role_check
      check (role in (
        'tutor', 'student', 'parent', 'support', 'trust_safety', 'finance',
        'growth', 'superadmin', 'academy'
      ));
  `.execute(db);

  await sql`
    alter table academies add column owner_user_id uuid null
      references users(id) on delete set null;
    create unique index academies_owner_user_id_uq
      on academies(owner_user_id) where owner_user_id is not null;
  `.execute(db);

  await sql`
    create table academy_membership_requests (
      id uuid primary key,
      academy_id uuid not null references academies(id) on delete cascade,
      tutor_id uuid not null references users(id) on delete cascade,
      status text not null default 'pending'
        check (status in ('pending', 'accepted', 'rejected')),
      message text null,
      decided_at timestamptz null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create unique index academy_membership_requests_pending_uq
      on academy_membership_requests(academy_id, tutor_id) where status = 'pending';
    create index academy_membership_requests_academy_id_idx
      on academy_membership_requests(academy_id);
    create index academy_membership_requests_tutor_id_idx
      on academy_membership_requests(tutor_id);
    create trigger set_updated_at before update on academy_membership_requests
      for each row execute function set_updated_at();
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists academy_membership_requests;`.execute(db);

  await sql`
    drop index if exists academies_owner_user_id_uq;
    alter table academies drop column if exists owner_user_id;
  `.execute(db);

  await sql`
    alter table user_roles drop constraint if exists user_roles_role_check;
    delete from user_roles where role = 'academy';
    alter table user_roles add constraint user_roles_role_check
      check (role in (
        'tutor', 'student', 'parent', 'support', 'trust_safety', 'finance',
        'growth', 'superadmin'
      ));
  `.execute(db);
}
