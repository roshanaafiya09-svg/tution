import { Kysely, sql } from 'kysely';

/**
 * Individual vs Academy teaching contexts.
 *
 * One teacher account, two strictly separate teaching contexts:
 *   INDIVIDUAL   — the teacher's own private business.
 *   ACADEMY <id> — activity that belongs to that academy.
 * `tutor_id` says WHO ran the activity; it is NOT an ownership boundary
 * (the same tutor_id appears on both Individual and Academy rows). The
 * context is an explicit, immutable column on the root record instead.
 *
 * Root records that carry the context:
 *   batches.academy_id       NULL = Individual, set = owned by that academy.
 *   assessments.academy_id   same convention (an assessment spans many
 *                            batches, so it needs its own column plus a
 *                            trigger that keeps every linked batch in the
 *                            same context).
 * Everything that hangs off a batch (class_sessions, enrollments,
 * attendance, teacher_attendance, invites, materials, fee_ledger, quizzes,
 * announcements, messages, cancellations, leave-request session snapshots)
 * derives its context from `batches.academy_id` through its batch_id FK.
 * That is deliberate: there is exactly one place the context is stored, so
 * no denormalised copy can drift. Because academy_id is immutable (trigger
 * below) and batch_id FKs never move, a downstream row's context can never
 * change after it is created.
 *
 * Deliberately NOT done here: no backfill. Every existing batch/assessment
 * stays Individual (academy_id NULL). Membership alone must never be read
 * as ownership, and there is no reliable marker for "this batch was made
 * from the academy dashboard", so guessing would risk exposing a teacher's
 * private data to an academy. Academy-owned batches are created from here
 * on, in the Academy context.
 *
 * on delete restrict: an academy that still owns batches cannot be deleted
 * out from under its students/attendance history.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    alter table batches
      add column academy_id uuid null references academies(id) on delete restrict;
    create index batches_academy_id_idx on batches(academy_id, tutor_id)
      where academy_id is not null;
    create index batches_individual_tutor_idx on batches(tutor_id)
      where academy_id is null;
  `.execute(db);

  await sql`
    alter table assessments
      add column academy_id uuid null references academies(id) on delete restrict;
    create index assessments_academy_id_idx on assessments(academy_id)
      where academy_id is not null;
  `.execute(db);

  // A record's context never changes after creation: no Individual ->
  // Academy conversion, no Academy -> Individual, no reassigning to a
  // different academy. Leaving an academy must not migrate records either.
  await sql`
    create function scholar_context_is_immutable() returns trigger as $$
    begin
      if new.academy_id is distinct from old.academy_id then
        raise exception '% context (academy_id) is immutable', tg_table_name
          using errcode = 'check_violation';
      end if;
      return new;
    end;
    $$ language plpgsql;

    create trigger batches_context_immutable
      before update of academy_id on batches
      for each row execute function scholar_context_is_immutable();
    create trigger assessments_context_immutable
      before update of academy_id on assessments
      for each row execute function scholar_context_is_immutable();
  `.execute(db);

  // An assessment delivered to several batches must stay inside one
  // context, otherwise a single record would straddle Individual and
  // Academy data.
  await sql`
    create function assessment_batches_same_context() returns trigger as $$
    declare
      assessment_academy uuid;
      batch_academy uuid;
    begin
      select academy_id into assessment_academy
        from assessments where id = new.assessment_id;
      select academy_id into batch_academy
        from batches where id = new.batch_id;
      if assessment_academy is distinct from batch_academy then
        raise exception 'assessment and batch belong to different teaching contexts'
          using errcode = 'check_violation';
      end if;
      return new;
    end;
    $$ language plpgsql;

    create trigger assessment_batches_same_context_trg
      before insert or update on assessment_batches
      for each row execute function assessment_batches_same_context();
  `.execute(db);

  // A holiday declared by an academy may only target that academy's own
  // batches.
  await sql`
    create function holiday_batches_same_academy() returns trigger as $$
    declare
      holiday_academy uuid;
      batch_academy uuid;
    begin
      select academy_id into holiday_academy
        from holidays where id = new.holiday_id;
      select academy_id into batch_academy
        from batches where id = new.batch_id;
      if holiday_academy is null or holiday_academy is distinct from batch_academy then
        raise exception 'a holiday can only target batches owned by its academy'
          using errcode = 'check_violation';
      end if;
      return new;
    end;
    $$ language plpgsql;

    create trigger holiday_batches_same_academy_trg
      before insert or update on holiday_batches
      for each row execute function holiday_batches_same_academy();
  `.execute(db);

  // An academy leave request may only snapshot classes that belong to that
  // academy — never the teacher's Individual classes.
  await sql`
    create function leave_sessions_same_academy() returns trigger as $$
    declare
      request_academy uuid;
      session_academy uuid;
    begin
      select academy_id into request_academy
        from teacher_leave_requests where id = new.leave_request_id;
      select b.academy_id into session_academy
        from class_sessions s join batches b on b.id = s.batch_id
        where s.id = new.session_id;
      if request_academy is distinct from session_academy then
        raise exception 'a leave request can only cover classes owned by its academy'
          using errcode = 'check_violation';
      end if;
      return new;
    end;
    $$ language plpgsql;

    create trigger leave_sessions_same_academy_trg
      before insert or update on teacher_leave_request_sessions
      for each row execute function leave_sessions_same_academy();
  `.execute(db);

  // An academy announcement addressed to one batch must name one of its
  // own batches.
  await sql`
    create function academy_announcement_batch_same_academy() returns trigger as $$
    declare
      batch_academy uuid;
    begin
      if new.audience_batch_id is null then
        return new;
      end if;
      select academy_id into batch_academy
        from batches where id = new.audience_batch_id;
      if batch_academy is distinct from new.academy_id then
        raise exception 'announcement audience batch belongs to another context'
          using errcode = 'check_violation';
      end if;
      return new;
    end;
    $$ language plpgsql;

    create trigger academy_announcement_batch_same_academy_trg
      before insert or update of audience_batch_id, academy_id on academy_announcements
      for each row execute function academy_announcement_batch_same_academy();
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    drop trigger if exists academy_announcement_batch_same_academy_trg on academy_announcements;
    drop function if exists academy_announcement_batch_same_academy();
    drop trigger if exists leave_sessions_same_academy_trg on teacher_leave_request_sessions;
    drop function if exists leave_sessions_same_academy();
    drop trigger if exists holiday_batches_same_academy_trg on holiday_batches;
    drop function if exists holiday_batches_same_academy();
    drop trigger if exists assessment_batches_same_context_trg on assessment_batches;
    drop function if exists assessment_batches_same_context();
    drop trigger if exists assessments_context_immutable on assessments;
    drop trigger if exists batches_context_immutable on batches;
    drop function if exists scholar_context_is_immutable();
    drop index if exists assessments_academy_id_idx;
    alter table assessments drop column if exists academy_id;
    drop index if exists batches_individual_tutor_idx;
    drop index if exists batches_academy_id_idx;
    alter table batches drop column if exists academy_id;
  `.execute(db);
}
