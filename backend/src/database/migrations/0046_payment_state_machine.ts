import { Kysely, sql } from 'kysely';

/**
 * H5 / H8 / H10 — make the payment state machine enforce itself in the
 * database instead of relying on application-level "if" checks.
 *
 *  1. One OPEN order per target (partial unique indexes). Pre-existing
 *     duplicate open rows are retired first so the indexes can be built.
 *  2. Guarded status transitions (trigger): a captured payment can never
 *     revert, a refunded one is terminal, a failed one may only become
 *     captured (a late success on an order whose first attempt failed).
 *  3. `payment_events`: every provider webhook is recorded under a UNIQUE
 *     (provider, provider_event_id) — replays are a no-op by construction.
 *  4. `payment_refunds`: an idempotent refund ledger. A BEFORE trigger
 *     (holding the payment row lock) refuses any refund set whose total
 *     would exceed the captured amount; an AFTER trigger keeps
 *     `payments.refunded_minor` / status='refunded' in step, so concurrent
 *     refunds cannot drift the totals.
 *  5. A fifth payment target — the ACADEMY's own subscription — and an
 *     `academy_id` on payouts so academy fee money has an owner.
 *  6. `settled_at`: set exactly once, when a capture has actually been
 *     applied to its target. Payout eligibility keys on it, so a captured-
 *     but-unapplied duplicate can never be paid out.
 */
export async function up(db: Kysely<any>): Promise<void> {
  // --- 5. new columns + target constraint -------------------------------
  await sql`
    alter table payments
      add column academy_subscription_id uuid null
        references academy_subscriptions(id) on delete cascade,
      add column blocks integer null check (blocks is null or blocks > 0),
      add column teacher_features integer null
        check (teacher_features is null or teacher_features >= 0),
      add column settled_at timestamptz null,
      add column refunded_minor integer not null default 0
        check (refunded_minor >= 0);

    create index payments_academy_subscription_id_idx
      on payments(academy_subscription_id);

    alter table payments drop constraint payments_target_check;
    alter table payments add constraint payments_target_check check (
      (fee_ledger_id is not null)::int
      + (subscription_id is not null)::int
      + (parent_subscription_id is not null)::int
      + (booking_id is not null)::int
      + (academy_subscription_id is not null)::int = 1
    );
    alter table payments add constraint payments_refunded_within_amount
      check (refunded_minor <= amount_minor);
  `.execute(db);

  // Rows captured before this migration were applied to their target at the
  // time (that was the only code path), so they are already settled.
  await sql`
    update payments set settled_at = updated_at
      where status in ('captured', 'refunded') and settled_at is null;
  `.execute(db);

  // --- 1. one open order per target -------------------------------------
  // Retire older duplicates (keep the newest open row per target).
  for (const col of [
    'fee_ledger_id',
    'subscription_id',
    'parent_subscription_id',
    'booking_id',
    'academy_subscription_id',
  ]) {
    await sql`
      update payments set status = 'failed', failure_reason = 'superseded'
      where id in (
        select id from (
          select id, row_number() over (
            partition by ${sql.ref(col)} order by created_at desc, id desc
          ) as rn
          from payments
          where status in ('created', 'authorized') and ${sql.ref(col)} is not null
        ) t where t.rn > 1
      );
    `.execute(db);
    await sql`
      create unique index ${sql.ref(`payments_one_open_per_${col}`)}
        on payments(${sql.ref(col)})
        where status in ('created', 'authorized') and ${sql.ref(col)} is not null;
    `.execute(db);
  }

  // --- 2. guarded transitions -------------------------------------------
  await sql`
    create function payments_guard_status() returns trigger as $$
    begin
      if new.status = old.status then
        return new;
      end if;
      if (old.status, new.status) in (
        ('created', 'authorized'),
        ('created', 'captured'),
        ('created', 'failed'),
        ('authorized', 'captured'),
        ('authorized', 'failed'),
        ('failed', 'captured'),
        ('captured', 'refunded')
      ) then
        if new.status = 'refunded' and new.refunded_minor < new.amount_minor then
          raise exception 'payment % cannot be refunded before it is fully refunded', old.id
            using errcode = '23514';
        end if;
        return new;
      end if;
      raise exception 'illegal payment status transition % -> % for %',
        old.status, new.status, old.id using errcode = '23514';
    end;
    $$ language plpgsql;

    create trigger payments_guard_status_trg
      before update of status on payments
      for each row execute function payments_guard_status();
  `.execute(db);

  // --- 3. provider event ledger -----------------------------------------
  await sql`
    create table payment_events (
      id uuid primary key,
      provider text not null,
      provider_event_id text not null,
      event_type text not null,
      provider_order_id text null,
      provider_payment_id text null,
      payment_id uuid null references payments(id) on delete set null,
      received_at timestamptz not null default now(),
      unique (provider, provider_event_id)
    );
    create index payment_events_payment_id_idx on payment_events(payment_id);
  `.execute(db);

  // --- 4. refund ledger --------------------------------------------------
  await sql`
    create table payment_refunds (
      id uuid primary key,
      payment_id uuid not null references payments(id) on delete cascade,
      amount_minor integer not null check (amount_minor > 0),
      status text not null default 'pending'
        check (status in ('pending', 'succeeded', 'failed')),
      reason text not null,
      idempotency_key text not null unique,
      provider_refund_id text null unique,
      failure_reason text null,
      -- Exactly ONE caller may talk to the provider for a refund at a time:
      -- it claims the dispatch atomically. A claim older than the stale
      -- window is presumed dead and may be re-claimed (after a receipt
      -- lookup, so the retry can never create a second provider refund).
      dispatched_at timestamptz null,
      dispatch_attempts integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index payment_refunds_payment_id_idx on payment_refunds(payment_id);
    create index payment_refunds_open_idx on payment_refunds(status)
      where status <> 'succeeded';
    create trigger set_updated_at before update on payment_refunds
      for each row execute function set_updated_at();

    create function payment_refunds_guard() returns trigger as $$
    declare
      cap integer;
      others integer;
    begin
      -- Lock the payment: concurrent refunds for one payment queue here, and
      -- the sum below is evaluated after the previous one committed.
      select amount_minor into cap from payments where id = new.payment_id for update;
      if new.status <> 'failed' then
        select coalesce(sum(amount_minor), 0) into others from payment_refunds
          where payment_id = new.payment_id and status <> 'failed' and id <> new.id;
        if others + new.amount_minor > cap then
          raise exception 'refunds (% + %) would exceed the captured amount %',
            others, new.amount_minor, cap using errcode = '23514';
        end if;
      end if;
      return new;
    end;
    $$ language plpgsql;

    create trigger payment_refunds_guard_trg
      before insert or update of amount_minor, status on payment_refunds
      for each row execute function payment_refunds_guard();

    create function payment_refunds_sync() returns trigger as $$
    declare
      done integer;
    begin
      select coalesce(sum(amount_minor), 0) into done from payment_refunds
        where payment_id = new.payment_id and status = 'succeeded';
      update payments
        set refunded_minor = done,
            status = case when done >= amount_minor and status = 'captured'
                          then 'refunded' else status end
        where id = new.payment_id;
      return null;
    end;
    $$ language plpgsql;

    create trigger payment_refunds_sync_trg
      after insert or update of status on payment_refunds
      for each row execute function payment_refunds_sync();
  `.execute(db);

  // --- 5b. payout owner --------------------------------------------------
  await sql`
    alter table payouts
      add column academy_id uuid null references academies(id) on delete set null;
    create index payouts_academy_id_idx on payouts(academy_id)
      where academy_id is not null;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    drop index if exists payouts_academy_id_idx;
    alter table payouts drop column if exists academy_id;

    drop trigger if exists payment_refunds_sync_trg on payment_refunds;
    drop trigger if exists payment_refunds_guard_trg on payment_refunds;
    drop function if exists payment_refunds_sync();
    drop function if exists payment_refunds_guard();
    drop table if exists payment_refunds;
    drop table if exists payment_events;

    drop trigger if exists payments_guard_status_trg on payments;
    drop function if exists payments_guard_status();

    drop index if exists payments_one_open_per_academy_subscription_id;
    drop index if exists payments_one_open_per_booking_id;
    drop index if exists payments_one_open_per_parent_subscription_id;
    drop index if exists payments_one_open_per_subscription_id;
    drop index if exists payments_one_open_per_fee_ledger_id;

    alter table payments drop constraint if exists payments_refunded_within_amount;
    alter table payments drop constraint payments_target_check;
    alter table payments add constraint payments_target_check check (
      (fee_ledger_id is not null)::int
      + (subscription_id is not null)::int
      + (parent_subscription_id is not null)::int
      + (booking_id is not null)::int = 1
    );
    drop index if exists payments_academy_subscription_id_idx;
    alter table payments
      drop column if exists refunded_minor,
      drop column if exists settled_at,
      drop column if exists teacher_features,
      drop column if exists blocks,
      drop column if exists academy_subscription_id;
  `.execute(db);
}
