import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table users (
      id uuid primary key,
      phone_e164 text not null unique,
      email text null,
      locale text not null default 'en' check (locale in ('en', 'ta')),
      timezone text not null default 'Asia/Kolkata',
      dob date null,
      status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz null
    );
    create trigger set_updated_at before update on users
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    create table user_roles (
      user_id uuid not null references users(id) on delete cascade,
      role text not null check (
        role in ('tutor', 'student', 'parent', 'support', 'trust_safety', 'finance', 'growth', 'superadmin')
      ),
      granted_at timestamptz not null default now(),
      primary key (user_id, role)
    );
  `.execute(db);

  await sql`
    create table profiles_tutor (
      user_id uuid primary key references users(id) on delete cascade,
      display_name text not null,
      headline text null,
      bio text null,
      years_experience integer null check (years_experience is null or years_experience >= 0),
      verification_status text not null default 'pending'
        check (verification_status in ('pending', 'verified', 'rejected')),
      slug text not null unique,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create trigger set_updated_at before update on profiles_tutor
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    create table profiles_student (
      user_id uuid primary key references users(id) on delete cascade,
      display_name text not null,
      grade_level text null,
      curriculum_id uuid null,
      school_name text null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create trigger set_updated_at before update on profiles_student
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    create table tutor_verifications (
      id uuid primary key,
      tutor_id uuid not null references users(id) on delete cascade,
      type text not null check (type in ('id_proof', 'qualification')),
      document_key text not null,
      status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
      reviewed_by uuid null references users(id),
      reviewed_at timestamptz null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index tutor_verifications_tutor_id_idx on tutor_verifications(tutor_id);
    create trigger set_updated_at before update on tutor_verifications
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    create table consent_records (
      id uuid primary key,
      user_id uuid not null references users(id) on delete cascade,
      consent_type text not null,
      policy_version text not null,
      granted_at timestamptz not null default now(),
      ip inet null,
      user_agent text null
    );
    create index consent_records_user_id_idx on consent_records(user_id);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists consent_records;`.execute(db);
  await sql`drop table if exists tutor_verifications;`.execute(db);
  await sql`drop table if exists profiles_student;`.execute(db);
  await sql`drop table if exists profiles_tutor;`.execute(db);
  await sql`drop table if exists user_roles;`.execute(db);
  await sql`drop table if exists users;`.execute(db);
}
