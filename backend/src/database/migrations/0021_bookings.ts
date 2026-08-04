import { Kysely, sql } from 'kysely';

/**
 * 1:1 marketplace bookings (blueprint §5/§9/§10 Phase 4): a student pays
 * directly for a single session with a tutor, distinct from batch fee
 * collection and every other payments target so far. Rate/amount are
 * snapshotted from tutor_subjects at booking time (a later rate change
 * shouldn't alter an already-created booking), and platform_fee_minor is
 * captured the same way — at booking-creation time, before any payment
 * exists — rather than deducted later like payout-time platformFeePercent.
 *
 * payments' three-way fee_ledger_id/subscription_id/parent_subscription_id
 * check (0019) becomes a four-way "exactly one of the four" check to add
 * booking_id as the fourth settleable target on the same audit ledger.
 *
 * No DB-level exclusion constraint against double-booking — enforced in
 * BookingsService, matching how batch capacity is enforced in code
 * rather than a DB constraint (see BatchesService).
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table bookings (
      id uuid primary key,
      tutor_id uuid not null references users(id) on delete cascade,
      student_id uuid not null references users(id) on delete cascade,
      subject_id uuid not null references subjects(id),
      hourly_rate_minor integer not null check (hourly_rate_minor >= 0),
      amount_minor integer not null check (amount_minor >= 0),
      platform_fee_minor integer not null default 0 check (platform_fee_minor >= 0),
      currency text not null default 'INR',
      scheduled_start_utc timestamptz not null,
      timezone text not null default 'Asia/Kolkata',
      duration_min integer not null check (duration_min > 0),
      meeting_url text null,
      status text not null default 'pending_payment'
        check (status in ('pending_payment', 'confirmed', 'completed', 'cancelled', 'no_show')),
      cancelled_by text null check (cancelled_by is null or cancelled_by in ('student', 'tutor')),
      cancellation_reason text null,
      refund_percent smallint null check (refund_percent is null or refund_percent between 0 and 100),
      original_scheduled_start_utc timestamptz null,
      reschedule_count integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index bookings_tutor_id_idx on bookings(tutor_id);
    create index bookings_student_id_idx on bookings(student_id);
    create index bookings_scheduled_start_utc_idx on bookings(scheduled_start_utc);
    create trigger set_updated_at before update on bookings
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    alter table payments
      add column booking_id uuid null references bookings(id) on delete cascade;

    alter table payments drop constraint payments_target_check;
    alter table payments
      add constraint payments_target_check check (
        (case when fee_ledger_id is not null then 1 else 0 end) +
        (case when subscription_id is not null then 1 else 0 end) +
        (case when parent_subscription_id is not null then 1 else 0 end) +
        (case when booking_id is not null then 1 else 0 end) = 1
      );

    create index payments_booking_id_idx on payments(booking_id);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    alter table payments drop constraint if exists payments_target_check;
    alter table payments
      add constraint payments_target_check check (
        (case when fee_ledger_id is not null then 1 else 0 end) +
        (case when subscription_id is not null then 1 else 0 end) +
        (case when parent_subscription_id is not null then 1 else 0 end) = 1
      );
    drop index if exists payments_booking_id_idx;
    alter table payments drop column if exists booking_id;
  `.execute(db);
  await sql`drop table if exists bookings;`.execute(db);
}
