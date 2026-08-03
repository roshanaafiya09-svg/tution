import { Kysely, sql } from 'kysely';

/**
 * Tutor payouts (blueprint §6, §10 Phase 2): "Fee collection... Route
 * split, tutor payout." The payouts table itself already exists
 * (0012) — this migration adds what was missing to actually generate
 * one:
 *  - payments.payout_id: which payout a captured fee-collection payment
 *    was aggregated into, so the same payment is never paid out twice
 *    across separate payout runs.
 *  - tutor_payout_accounts: whether a tutor has completed Razorpay
 *    Route's linked-account onboarding (KYC + bank details, entirely
 *    out of band on Razorpay's own dashboard/API — not something this
 *    schema can do more than record the resulting account id).
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    alter table payments
      add column payout_id uuid null references payouts(id) on delete set null;
    create index payments_payout_id_idx on payments(payout_id);
  `.execute(db);

  await sql`
    create table tutor_payout_accounts (
      tutor_id uuid primary key references users(id) on delete cascade,
      provider text not null default 'razorpay',
      provider_account_id text null,
      status text not null default 'pending'
        check (status in ('pending', 'active', 'rejected')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create trigger set_updated_at before update on tutor_payout_accounts
      for each row execute function set_updated_at();
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists tutor_payout_accounts;`.execute(db);
  await sql`
    drop index if exists payments_payout_id_idx;
    alter table payments drop column if exists payout_id;
  `.execute(db);
}
