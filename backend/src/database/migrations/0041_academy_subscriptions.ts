import { Kysely, sql } from 'kysely';

/**
 * The Academy's own plan — the counterpart of `subscriptions` (migration
 * 0006), which is the TEACHER's Individual plan.
 *
 *   subscriptions          (tutor_id)   the teacher pays -> Individual context
 *   academy_subscriptions  (academy_id) the academy pays -> Academy context
 *
 * They are deliberately separate tables with no link: an academy plan can
 * never silently cover a teacher's Individual business, and a teacher's
 * Individual plan can never cover (or be consumed by) academy activity.
 * Which one is checked for a request is decided by the teaching context of
 * the record being created — see ActiveSubscriptionGuard.
 *
 * Mirrors `subscriptions`: a 90-day trial starts lazily the first time the
 * plan is checked (same self-healing pattern as SubscriptionsService).
 * Only the entitlement lives here; an Academy checkout flow that moves a
 * row to 'active' is not part of this migration.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table academy_subscriptions (
      id uuid primary key,
      academy_id uuid not null unique references academies(id) on delete cascade,
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
    create trigger set_updated_at before update on academy_subscriptions
      for each row execute function set_updated_at();
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists academy_subscriptions;`.execute(db);
}
