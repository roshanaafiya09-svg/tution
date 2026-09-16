import { Kysely, sql } from 'kysely';
import { newId } from '../id';

/**
 * Holiday & Teacher Leave Management. Deliberately does NOT add a
 * `class_cancellations`/`class_reschedules`/`substitute_assignments`
 * table — `class_sessions` already has a `status` field for exactly
 * this, so cancellation/substitute state is four additive columns on
 * it instead of a shadow table. No CLASS_RESCHEDULED trigger workflow
 * is built in this pass (nothing in the feature spec ever describes one
 * being manually triggered), so no reschedule-specific column is added
 * either — a future pass can add `rescheduled_to_session_id` then.
 *
 * `holidays.state_code = null` means a NATIONAL holiday (Republic Day,
 * Independence Day, Gandhi Jayanthi) — applies to every academy
 * regardless of state. A non-null value scopes to that one state. This
 * is what lets Kerala/Karnataka/etc. be added later as pure data, with
 * zero code changes — see HolidayService's query, which matches
 * `state_code = :academyState OR state_code IS NULL`.
 *
 * `academies.state_code`/`country_code` (default 'TN'/'IN') mean a
 * per-academy state is already modeled even though only TN exists in
 * V1 — the `auto_observe_govt_holidays` toggle is the "ON/OFF" setting
 * from the spec.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table holidays (
      id uuid primary key,
      type text not null check (type in ('government_holiday', 'academy_holiday')),
      name text not null,
      start_date date not null,
      end_date date not null check (end_date >= start_date),
      country_code text not null default 'IN',
      state_code text null,
      academy_id uuid null references academies(id) on delete cascade,
      scope text not null default 'academy' check (scope in ('academy', 'batches')),
      description text null,
      created_by uuid null references users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (
        (type = 'government_holiday' and academy_id is null)
        or (type = 'academy_holiday' and academy_id is not null)
      )
    );
    create index holidays_country_state_date_idx
      on holidays(country_code, state_code, start_date, end_date)
      where type = 'government_holiday';
    create index holidays_academy_id_date_idx
      on holidays(academy_id, start_date, end_date)
      where academy_id is not null;
    create trigger set_updated_at before update on holidays
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    create table holiday_batches (
      holiday_id uuid not null references holidays(id) on delete cascade,
      batch_id uuid not null references batches(id) on delete cascade,
      primary key (holiday_id, batch_id)
    );
    create index holiday_batches_batch_id_idx on holiday_batches(batch_id);
  `.execute(db);

  await sql`
    create table teacher_leave_requests (
      id uuid primary key,
      tutor_id uuid not null references users(id) on delete cascade,
      academy_id uuid not null references academies(id) on delete cascade,
      start_date date not null,
      end_date date not null check (end_date >= start_date),
      leave_type text not null check (leave_type in ('full_day', 'specific_classes')),
      reason text null,
      status text not null default 'pending'
        check (status in ('pending', 'approved', 'rejected', 'cancelled')),
      decided_by uuid null references users(id) on delete set null,
      decided_at timestamptz null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index teacher_leave_requests_tutor_id_idx on teacher_leave_requests(tutor_id);
    create index teacher_leave_requests_academy_id_status_idx
      on teacher_leave_requests(academy_id, status);
    create trigger set_updated_at before update on teacher_leave_requests
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    create table teacher_leave_request_sessions (
      id uuid primary key,
      leave_request_id uuid not null references teacher_leave_requests(id) on delete cascade,
      session_id uuid not null references class_sessions(id) on delete cascade,
      unique (leave_request_id, session_id)
    );
    create index teacher_leave_request_sessions_session_id_idx
      on teacher_leave_request_sessions(session_id);
  `.execute(db);

  await sql`
    alter table class_sessions
      add column cancellation_reason text null
        check (cancellation_reason in (
          'government_holiday', 'academy_holiday', 'teacher_leave', 'manual'
        )),
      add column holiday_id uuid null references holidays(id) on delete set null,
      add column teacher_leave_request_id uuid null
        references teacher_leave_requests(id) on delete set null,
      add column substitute_tutor_id uuid null references users(id) on delete set null;

    create index class_sessions_holiday_id_idx on class_sessions(holiday_id)
      where holiday_id is not null;
    create index class_sessions_teacher_leave_request_id_idx
      on class_sessions(teacher_leave_request_id)
      where teacher_leave_request_id is not null;
    create index class_sessions_scheduled_start_status_idx
      on class_sessions(scheduled_start_utc, status);
  `.execute(db);

  await sql`
    alter table academies
      add column country_code text not null default 'IN',
      add column state_code text not null default 'TN',
      add column auto_observe_govt_holidays boolean not null default false;
  `.execute(db);

  // Tamil Nadu government holidays for 2026 — sourced from the Govt. of
  // Tamil Nadu's official notification G.O.(Ms.) No.708, Public
  // (Miscellaneous) Department, issued 2025-11-11 (23 calendar holidays;
  // the notification's 24th entry, annual bank-account closing on Apr 1,
  // is bank-only and not relevant to tuition scheduling, so it's
  // excluded here). Republic Day / Independence Day / Gandhi Jayanthi
  // are national holidays (state_code null); every other entry is TN's
  // own state declaration. Add future years the same way: a new
  // `00XX_tn_holidays_20XX.ts` migration once TN publishes its next
  // official list — do not hand-generate lunar/festival dates. IDs are
  // generated app-side via newId() (uuidv7), same as every other row in
  // this codebase — never gen_random_uuid() (see 0001's doc comment on
  // why: app-side ids keep this portable across managed Postgres
  // providers with no custom extensions).
  const tnGovernmentHolidays2026: Array<{
    name: string;
    date: string;
    stateCode: string | null;
  }> = [
    { name: "New Year's Day", date: '2026-01-01', stateCode: 'TN' },
    { name: 'Pongal', date: '2026-01-15', stateCode: 'TN' },
    { name: 'Thiruvalluvar Day', date: '2026-01-16', stateCode: 'TN' },
    { name: 'Uzhavar Thirunal', date: '2026-01-17', stateCode: 'TN' },
    { name: 'Republic Day', date: '2026-01-26', stateCode: null },
    { name: 'Thai Poosam', date: '2026-02-01', stateCode: 'TN' },
    { name: 'Telugu New Year', date: '2026-03-19', stateCode: 'TN' },
    { name: 'Ramzan (Eid-ul-Fitr)', date: '2026-03-21', stateCode: 'TN' },
    { name: 'Mahaveer Jayanthi', date: '2026-03-31', stateCode: 'TN' },
    { name: 'Good Friday', date: '2026-04-03', stateCode: 'TN' },
    {
      name: "Tamil New Year / Dr. B.R. Ambedkar's Birthday",
      date: '2026-04-14',
      stateCode: 'TN',
    },
    { name: 'May Day', date: '2026-05-01', stateCode: 'TN' },
    { name: 'Bakrid (Eid-ul-Azha)', date: '2026-05-28', stateCode: 'TN' },
    { name: 'Muharram', date: '2026-06-26', stateCode: 'TN' },
    { name: 'Independence Day', date: '2026-08-15', stateCode: null },
    { name: 'Milad-un-Nabi', date: '2026-08-26', stateCode: 'TN' },
    { name: 'Krishna Jayanthi', date: '2026-09-04', stateCode: 'TN' },
    { name: 'Vinayakar Chathurthi', date: '2026-09-14', stateCode: 'TN' },
    { name: 'Gandhi Jayanthi', date: '2026-10-02', stateCode: null },
    { name: 'Ayutha Pooja', date: '2026-10-19', stateCode: 'TN' },
    { name: 'Vijaya Dashami', date: '2026-10-20', stateCode: 'TN' },
    { name: 'Deepavali', date: '2026-11-08', stateCode: 'TN' },
    { name: 'Christmas', date: '2026-12-25', stateCode: 'TN' },
  ];

  await db
    .insertInto('holidays')
    .values(
      tnGovernmentHolidays2026.map((h) => ({
        id: newId(),
        type: 'government_holiday',
        name: h.name,
        start_date: h.date,
        end_date: h.date,
        country_code: 'IN',
        state_code: h.stateCode,
      })),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    alter table academies
      drop column if exists auto_observe_govt_holidays,
      drop column if exists state_code,
      drop column if exists country_code;
  `.execute(db);

  await sql`
    alter table class_sessions
      drop column if exists substitute_tutor_id,
      drop column if exists teacher_leave_request_id,
      drop column if exists holiday_id,
      drop column if exists cancellation_reason;
  `.execute(db);

  await sql`drop table if exists teacher_leave_request_sessions;`.execute(db);
  await sql`drop table if exists teacher_leave_requests;`.execute(db);
  await sql`drop table if exists holiday_batches;`.execute(db);
  await sql`drop table if exists holidays;`.execute(db);
}
