import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table materials (
      id uuid primary key,
      batch_id uuid not null references batches(id) on delete cascade,
      tutor_id uuid not null references users(id) on delete cascade,
      title text not null,
      object_key text not null,
      mime text not null,
      size_bytes bigint not null check (size_bytes >= 0),
      created_at timestamptz not null default now()
    );
    create index materials_batch_id_idx on materials(batch_id);
  `.execute(db);

  await sql`
    create table assignments (
      id uuid primary key,
      batch_id uuid not null references batches(id) on delete cascade,
      title text not null,
      instructions text null,
      due_at_utc timestamptz not null,
      timezone text not null default 'Asia/Kolkata',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index assignments_batch_id_idx on assignments(batch_id);
    create trigger set_updated_at before update on assignments
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    create table submissions (
      id uuid primary key,
      assignment_id uuid not null references assignments(id) on delete cascade,
      student_id uuid not null references users(id) on delete cascade,
      object_keys jsonb not null default '[]',
      submitted_at timestamptz not null default now(),
      grade text null,
      feedback text null,
      graded_at timestamptz null,
      updated_at timestamptz not null default now(),
      unique (assignment_id, student_id)
    );
    create index submissions_student_id_idx on submissions(student_id);
    create trigger set_updated_at before update on submissions
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    create table announcements (
      id uuid primary key,
      batch_id uuid not null references batches(id) on delete cascade,
      tutor_id uuid not null references users(id) on delete cascade,
      body text not null,
      created_at timestamptz not null default now()
    );
    create index announcements_batch_id_idx on announcements(batch_id);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists announcements;`.execute(db);
  await sql`drop table if exists submissions;`.execute(db);
  await sql`drop table if exists assignments;`.execute(db);
  await sql`drop table if exists materials;`.execute(db);
}
