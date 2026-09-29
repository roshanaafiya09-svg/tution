import { Kysely, sql } from 'kysely';

/**
 * H1 + H9.
 *
 * H1 — student-block billing. One block = 25 active students. A paid
 * subscription period carries `purchased_blocks` of capacity; it is fixed
 * for the period (so a student leaving mid-period frees capacity that can
 * be REUSED, but nothing is refunded) and is recomputed from real usage at
 * the next purchase. Trial rows keep `purchased_blocks = 0` — trial capacity
 * is unrestricted, exactly as before.
 *
 * H9 — batch capacity. The service serialises enrollment with row locks; the
 * trigger below is the database-level backstop, so even a code path that
 * bypasses the service cannot oversell a batch. The trigger takes the batch
 * row lock itself, which is what makes concurrent inserts queue up.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    alter table subscriptions
      add column purchased_blocks integer not null default 0
        check (purchased_blocks >= 0),
      add column period_start timestamptz null;

    alter table academy_subscriptions
      add column purchased_blocks integer not null default 0
        check (purchased_blocks >= 0),
      add column purchased_teacher_features integer not null default 0
        check (purchased_teacher_features >= 0),
      add column period_start timestamptz null;
  `.execute(db);

  // Existing paid tutor subscriptions were sold as "up to 25" (basic) or
  // "up to 100" (pro): translate that promise into blocks so nobody who has
  // already paid is suddenly capped lower than what they bought.
  await sql`
    update subscriptions set purchased_blocks = case
      when plan_id in ('monthly_pro', 'annual_pro') then 4
      else 1
    end
    where status = 'active';
  `.execute(db);

  await sql`
    create index enrollments_active_batch_idx
      on enrollments (batch_id) where status = 'active';
    create index enrollments_active_student_idx
      on enrollments (student_id) where status = 'active';
  `.execute(db);

  // Backstop: a batch can never hold more active enrollments than its
  // capacity. `for update` on the batch row serialises concurrent inserts
  // for the same batch (READ COMMITTED re-evaluates the count after the lock
  // is granted, so the second waiter sees the first waiter's row).
  await sql`
    create function enforce_batch_capacity() returns trigger as $$
    declare
      cap integer;
      taken integer;
    begin
      if new.status <> 'active' then
        return new;
      end if;
      select capacity into cap from batches where id = new.batch_id for update;
      if cap is null then
        return new;
      end if;
      -- Count OTHER students. Excluding by student (not just row id) matters
      -- because INSERT .. ON CONFLICT fires BEFORE triggers even when it will
      -- become an update of the student's existing row.
      select count(*) into taken from enrollments
        where batch_id = new.batch_id and status = 'active'
          and student_id <> new.student_id;
      if taken >= cap then
        raise exception 'batch_capacity_exceeded'
          using errcode = '23514',
                detail = format('batch %s is at capacity %s', new.batch_id, cap);
      end if;
      return new;
    end;
    $$ language plpgsql;

    create trigger enrollments_enforce_capacity
      before insert or update of status on enrollments
      for each row execute function enforce_batch_capacity();
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    drop trigger if exists enrollments_enforce_capacity on enrollments;
    drop function if exists enforce_batch_capacity();
    drop index if exists enrollments_active_student_idx;
    drop index if exists enrollments_active_batch_idx;
    alter table academy_subscriptions
      drop column if exists period_start,
      drop column if exists purchased_teacher_features,
      drop column if exists purchased_blocks;
    alter table subscriptions
      drop column if exists period_start,
      drop column if exists purchased_blocks;
  `.execute(db);
}
