import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table batches (
      id uuid primary key,
      tutor_id uuid not null references users(id) on delete cascade,
      title text not null,
      subject_id uuid not null references subjects(id),
      grade_level_id uuid not null references grade_levels(id),
      capacity integer not null check (capacity > 0),
      fee_minor integer not null check (fee_minor >= 0),
      currency varchar(3) not null default 'INR',
      fee_period text not null default 'monthly' check (fee_period in ('monthly', 'quarterly', 'one_time')),
      status text not null default 'active' check (status in ('active', 'archived')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index batches_tutor_id_idx on batches(tutor_id);
    create trigger set_updated_at before update on batches
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    create table enrollments (
      id uuid primary key,
      batch_id uuid not null references batches(id) on delete cascade,
      student_id uuid not null references users(id) on delete cascade,
      status text not null default 'active' check (status in ('active', 'left')),
      joined_at timestamptz not null default now(),
      left_at timestamptz null,
      updated_at timestamptz not null default now(),
      unique (batch_id, student_id)
    );
    create index enrollments_student_id_idx on enrollments(student_id);
    create trigger set_updated_at before update on enrollments
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    create table invites (
      id uuid primary key,
      tutor_id uuid not null references users(id) on delete cascade,
      batch_id uuid not null references batches(id) on delete cascade,
      token text not null unique,
      expires_at timestamptz not null,
      max_uses integer not null default 1 check (max_uses > 0),
      used_count integer not null default 0 check (used_count >= 0 and used_count <= max_uses),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index invites_batch_id_idx on invites(batch_id);
    create trigger set_updated_at before update on invites
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    create table class_sessions (
      id uuid primary key,
      batch_id uuid not null references batches(id) on delete cascade,
      tutor_id uuid not null references users(id) on delete cascade,
      scheduled_start_utc timestamptz not null,
      timezone text not null default 'Asia/Kolkata',
      duration_min integer not null check (duration_min > 0),
      meeting_url text null,
      recurrence_rule text null,
      recurrence_parent_id uuid null references class_sessions(id),
      status text not null default 'scheduled'
        check (status in ('scheduled', 'completed', 'cancelled')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index class_sessions_batch_id_idx on class_sessions(batch_id);
    create index class_sessions_tutor_id_scheduled_start_idx
      on class_sessions(tutor_id, scheduled_start_utc);
    create trigger set_updated_at before update on class_sessions
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    create table attendance (
      id uuid primary key,
      session_id uuid not null references class_sessions(id) on delete cascade,
      student_id uuid not null references users(id) on delete cascade,
      status text not null check (status in ('present', 'absent', 'late')),
      joined_at timestamptz null,
      marked_by uuid null references users(id),
      method text not null default 'manual' check (method in ('join_tap', 'manual')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (session_id, student_id)
    );
    create index attendance_student_id_idx on attendance(student_id);
    create trigger set_updated_at before update on attendance
      for each row execute function set_updated_at();
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists attendance;`.execute(db);
  await sql`drop table if exists class_sessions;`.execute(db);
  await sql`drop table if exists invites;`.execute(db);
  await sql`drop table if exists enrollments;`.execute(db);
  await sql`drop table if exists batches;`.execute(db);
}
