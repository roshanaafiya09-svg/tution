import { Kysely, sql } from 'kysely';

/**
 * Tutor subscription purchase (blueprint §5, §10 Phase 2): the ₹499/999
 * recurring charge that ends the 90-day trial. Distinct from fee
 * *collection* (0012's payments table, parent pays tutor for tuition) —
 * this is the tutor paying the platform for their own subscription.
 * Reuses the same `payments` audit table rather than a parallel one, so
 * every payment in or out of the platform has one ledger: fee_ledger_id
 * XOR subscription_id identifies which side of the business a given row
 * settles. plan_id records which SUBSCRIPTION_PLANS tier was purchased,
 * needed at capture time to compute the new current_period_end.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    alter table payments alter column fee_ledger_id drop not null;

    alter table payments
      add column subscription_id uuid null references subscriptions(id) on delete cascade,
      add column plan_id text null;

    alter table payments
      add constraint payments_target_check check (
        (fee_ledger_id is not null and subscription_id is null) or
        (fee_ledger_id is null and subscription_id is not null)
      );

    create index payments_subscription_id_idx on payments(subscription_id);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    alter table payments drop constraint if exists payments_target_check;
    drop index if exists payments_subscription_id_idx;
    alter table payments drop column if exists plan_id;
    alter table payments drop column if exists subscription_id;
    alter table payments alter column fee_ledger_id set not null;
  `.execute(db);
}
