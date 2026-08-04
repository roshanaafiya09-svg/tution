import { Kysely, sql } from 'kysely';

/**
 * Waitlists -> booking conversion (blueprint §10 Phase 4). A student
 * joins a waitlist for a tutor+subject offering that has no open slot;
 * when a booking for that offering is cancelled (or a tutor manually
 * pings their waitlist), waiting students get notified and have an
 * exclusivity window to convert before it lapses back to the general
 * waitlist. No automatic slot-matching against newly-created
 * availability — out of scope for this pass (see BookingsService).
 *
 * The partial unique index (not a plain unique constraint) is what lets
 * a student join, get notified, expire, and re-join later without a
 * historical 'expired'/'cancelled' row blocking the new active entry —
 * only one row per (tutor_subject_id, student_id) may be actively
 * 'waiting'/'notified' at a time.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table booking_waitlists (
      id uuid primary key,
      tutor_subject_id uuid not null references tutor_subjects(id) on delete cascade,
      tutor_id uuid not null references users(id) on delete cascade,
      student_id uuid not null references users(id) on delete cascade,
      status text not null default 'waiting'
        check (status in ('waiting', 'notified', 'converted', 'expired', 'cancelled')),
      notified_at timestamptz null,
      expires_at timestamptz null,
      converted_booking_id uuid null references bookings(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create unique index booking_waitlists_active_unique
      on booking_waitlists(tutor_subject_id, student_id)
      where status in ('waiting', 'notified');
    create index booking_waitlists_student_id_idx on booking_waitlists(student_id);
    create index booking_waitlists_tutor_id_idx on booking_waitlists(tutor_id);
    create trigger set_updated_at before update on booking_waitlists
      for each row execute function set_updated_at();
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists booking_waitlists;`.execute(db);
}
