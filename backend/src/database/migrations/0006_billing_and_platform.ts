import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table fee_ledger (
      id uuid primary key,
      tutor_id uuid not null references users(id) on delete cascade,
      student_id uuid not null references users(id) on delete cascade,
      batch_id uuid not null references batches(id) on delete cascade,
      period_label text not null,
      expected_minor integer not null check (expected_minor >= 0),
      currency varchar(3) not null default 'INR',
      status text not null default 'due' check (status in ('due', 'partial', 'paid', 'waived')),
      recorded_paid_minor integer null check (recorded_paid_minor is null or recorded_paid_minor >= 0),
      paid_at timestamptz null,
      note text null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (batch_id, student_id, period_label)
    );
    create index fee_ledger_tutor_id_idx on fee_ledger(tutor_id);
    create index fee_ledger_student_id_idx on fee_ledger(student_id);
    create trigger set_updated_at before update on fee_ledger
      for each row execute function set_updated_at();
  `.execute(db);

  // Trial-only in Phase 1: trial_ends_at is set on tutor signup and shown
  // in the value-recap paywall, but nothing enforces it until Phase 2.
  await sql`
    create table subscriptions (
      id uuid primary key,
      tutor_id uuid not null unique references users(id) on delete cascade,
      plan_id text not null default 'trial',
      status text not null default 'trialing'
        check (status in ('trialing', 'active', 'past_due', 'cancelled')),
      trial_ends_at timestamptz not null,
      current_period_end timestamptz null,
      provider text null,
      provider_ref text null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create trigger set_updated_at before update on subscriptions
      for each row execute function set_updated_at();
  `.execute(db);

  // Append-only by design (blueprint §9): a trigger blocks UPDATE/DELETE
  // outright rather than relying on application discipline alone.
  await sql`
    create table audit_logs (
      id uuid primary key,
      actor_id uuid null references users(id),
      actor_role text not null,
      action text not null,
      entity text not null,
      entity_id uuid not null,
      diff jsonb null,
      ip inet null,
      created_at timestamptz not null default now()
    );
    create index audit_logs_entity_idx on audit_logs(entity, entity_id);
    create index audit_logs_actor_id_idx on audit_logs(actor_id);

    create function prevent_audit_log_mutation() returns trigger as $$
    begin
      raise exception 'audit_logs is append-only: % is not allowed', TG_OP;
    end;
    $$ language plpgsql;

    create trigger audit_logs_immutable
      before update or delete on audit_logs
      for each row execute function prevent_audit_log_mutation();
  `.execute(db);

  await sql`
    create table notifications (
      id uuid primary key,
      user_id uuid not null references users(id) on delete cascade,
      type text not null,
      payload jsonb not null default '{}',
      read_at timestamptz null,
      created_at timestamptz not null default now()
    );
    create index notifications_user_id_idx on notifications(user_id);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists notifications;`.execute(db);
  await sql`drop trigger if exists audit_logs_immutable on audit_logs;`.execute(
    db,
  );
  await sql`drop function if exists prevent_audit_log_mutation();`.execute(db);
  await sql`drop table if exists audit_logs;`.execute(db);
  await sql`drop table if exists subscriptions;`.execute(db);
  await sql`drop table if exists fee_ledger;`.execute(db);
}
