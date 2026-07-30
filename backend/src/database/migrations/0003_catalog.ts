import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table curricula (
      id uuid primary key,
      slug text not null unique,
      name text not null,
      country_code text not null default 'IN',
      created_at timestamptz not null default now()
    );
  `.execute(db);

  // profiles_student.curriculum_id references curricula — add the FK now
  // that curricula exists (table order in 0002 predates this one).
  await sql`
    alter table profiles_student
      add constraint profiles_student_curriculum_id_fkey
      foreign key (curriculum_id) references curricula(id);
  `.execute(db);

  await sql`
    create table subjects (
      id uuid primary key,
      slug text not null unique,
      name_i18n jsonb not null,
      created_at timestamptz not null default now()
    );
  `.execute(db);

  await sql`
    create table grade_levels (
      id uuid primary key,
      curriculum_id uuid not null references curricula(id) on delete cascade,
      ordinal integer not null,
      label text not null,
      unique (curriculum_id, ordinal)
    );
  `.execute(db);

  await sql`
    create table tutor_subjects (
      id uuid primary key,
      tutor_id uuid not null references users(id) on delete cascade,
      subject_id uuid not null references subjects(id),
      curriculum_id uuid not null references curricula(id),
      grade_min integer not null,
      grade_max integer not null check (grade_max >= grade_min),
      hourly_rate_minor integer not null check (hourly_rate_minor >= 0),
      currency varchar(3) not null default 'INR',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index tutor_subjects_tutor_id_idx on tutor_subjects(tutor_id);
    create trigger set_updated_at before update on tutor_subjects
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    create table tutor_availability (
      id uuid primary key,
      tutor_id uuid not null references users(id) on delete cascade,
      weekday smallint not null check (weekday between 0 and 6),
      start_time time not null,
      end_time time not null check (end_time > start_time),
      timezone text not null default 'Asia/Kolkata',
      effective_from date not null,
      effective_to date null check (effective_to is null or effective_to >= effective_from),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index tutor_availability_tutor_id_idx on tutor_availability(tutor_id);
    create trigger set_updated_at before update on tutor_availability
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    create table tutor_availability_exceptions (
      id uuid primary key,
      tutor_id uuid not null references users(id) on delete cascade,
      date date not null,
      is_available boolean not null default false,
      start_time time null,
      end_time time null check (end_time is null or start_time is null or end_time > start_time),
      created_at timestamptz not null default now(),
      unique (tutor_id, date)
    );
    create index tutor_availability_exceptions_tutor_id_idx
      on tutor_availability_exceptions(tutor_id);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists tutor_availability_exceptions;`.execute(db);
  await sql`drop table if exists tutor_availability;`.execute(db);
  await sql`drop table if exists tutor_subjects;`.execute(db);
  await sql`drop table if exists grade_levels;`.execute(db);
  await sql`drop table if exists subjects;`.execute(db);
  await sql`
    alter table profiles_student drop constraint if exists profiles_student_curriculum_id_fkey;
  `.execute(db);
  await sql`drop table if exists curricula;`.execute(db);
}
