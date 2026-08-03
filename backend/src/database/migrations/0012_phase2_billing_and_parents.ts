import { Kysely, sql } from 'kysely';

/**
 * Phase 2 (blueprint §7, §10): payments/payouts back Razorpay fee
 * *collection* (fee_ledger stays the Phase 1 manual-tracking record;
 * a payment settles one fee_ledger row). parent_child_links + digests
 * back parent accounts and the AI weekly digest.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table payments (
      id uuid primary key,
      fee_ledger_id uuid not null references fee_ledger(id) on delete cascade,
      payer_id uuid not null references users(id),
      amount_minor integer not null check (amount_minor > 0),
      currency varchar(3) not null default 'INR',
      status text not null default 'created'
        check (status in ('created', 'authorized', 'captured', 'failed', 'refunded')),
      provider text not null default 'razorpay',
      provider_order_id text null,
      provider_payment_id text null,
      failure_reason text null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (provider_order_id),
      unique (provider_payment_id)
    );
    create index payments_fee_ledger_id_idx on payments(fee_ledger_id);
    create index payments_payer_id_idx on payments(payer_id);
    create trigger set_updated_at before update on payments
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    create table payouts (
      id uuid primary key,
      tutor_id uuid not null references users(id) on delete cascade,
      amount_minor integer not null check (amount_minor >= 0),
      currency varchar(3) not null default 'INR',
      status text not null default 'pending'
        check (status in ('pending', 'processing', 'paid', 'failed')),
      provider text not null default 'razorpay',
      provider_payout_id text null,
      period_start date not null,
      period_end date not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (provider_payout_id)
    );
    create index payouts_tutor_id_idx on payouts(tutor_id);
    create trigger set_updated_at before update on payouts
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    create table parent_child_links (
      id uuid primary key,
      parent_id uuid not null references users(id) on delete cascade,
      student_id uuid not null references users(id) on delete cascade,
      status text not null default 'pending'
        check (status in ('pending', 'active', 'revoked')),
      consent_record_id uuid null references consent_records(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (parent_id, student_id)
    );
    create index parent_child_links_parent_id_idx on parent_child_links(parent_id);
    create index parent_child_links_student_id_idx on parent_child_links(student_id);
    create trigger set_updated_at before update on parent_child_links
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    create table digests (
      id uuid primary key,
      parent_id uuid not null references users(id) on delete cascade,
      student_id uuid not null references users(id) on delete cascade,
      period_start date not null,
      period_end date not null,
      locale text not null default 'en',
      narrative text not null,
      stats jsonb not null default '{}',
      sent_at timestamptz null,
      created_at timestamptz not null default now(),
      unique (parent_id, student_id, period_start)
    );
    create index digests_parent_id_idx on digests(parent_id);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists digests;`.execute(db);
  await sql`drop table if exists parent_child_links;`.execute(db);
  await sql`drop table if exists payouts;`.execute(db);
  await sql`drop table if exists payments;`.execute(db);
}
