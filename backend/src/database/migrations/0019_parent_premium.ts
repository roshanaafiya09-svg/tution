import { Kysely, sql } from 'kysely';

/**
 * Parent premium tier (blueprint §5/§10 Phase 3): "₹99–149/mo for AI
 * doubt solver + rich digests, sold on web." A parent's own recurring
 * charge — separate from fee *collection* and from the tutor's own
 * subscription — so parent_premium_subscriptions mirrors `subscriptions`
 * (0006) but with no trial concept (premium is opt-in paid only, status
 * starts 'inactive' not 'trialing').
 *
 * payments' two-way fee_ledger_id/subscription_id check (0014) becomes a
 * three-way "exactly one of the three" check to add parent_subscription_id
 * as a third settleable target on the same audit ledger.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table parent_premium_subscriptions (
      id uuid primary key,
      parent_id uuid not null unique references users(id) on delete cascade,
      plan_id text null,
      status text not null default 'inactive'
        check (status in ('inactive', 'active', 'past_due', 'cancelled')),
      current_period_end timestamptz null,
      provider text null,
      provider_ref text null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create trigger set_updated_at before update on parent_premium_subscriptions
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    alter table payments
      add column parent_subscription_id uuid null
        references parent_premium_subscriptions(id) on delete cascade;

    alter table payments drop constraint payments_target_check;
    alter table payments
      add constraint payments_target_check check (
        (case when fee_ledger_id is not null then 1 else 0 end) +
        (case when subscription_id is not null then 1 else 0 end) +
        (case when parent_subscription_id is not null then 1 else 0 end) = 1
      );

    create index payments_parent_subscription_id_idx on payments(parent_subscription_id);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    alter table payments drop constraint if exists payments_target_check;
    alter table payments
      add constraint payments_target_check check (
        (fee_ledger_id is not null and subscription_id is null) or
        (fee_ledger_id is null and subscription_id is not null)
      );
    drop index if exists payments_parent_subscription_id_idx;
    alter table payments drop column if exists parent_subscription_id;
  `.execute(db);
  await sql`drop table if exists parent_premium_subscriptions;`.execute(db);
}
