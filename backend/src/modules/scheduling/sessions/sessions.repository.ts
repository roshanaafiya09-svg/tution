import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

export interface NewSession {
  batchId: string;
  tutorId: string;
  scheduledStartUtc: Date;
  timezone: string;
  durationMin: number;
  meetingUrl: string | null;
  recurrenceRule: string | null;
  recurrenceParentId: string | null;
}

@Injectable()
export class SessionsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  findById(id: string) {
    return this.db
      .selectFrom('class_sessions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /** Inserts a whole recurrence series in one transaction. */
  async createSeries(sessions: NewSession[]) {
    const rows = sessions.map((s) => ({
      id: newId(),
      batch_id: s.batchId,
      tutor_id: s.tutorId,
      scheduled_start_utc: s.scheduledStartUtc,
      timezone: s.timezone,
      duration_min: s.durationMin,
      meeting_url: s.meetingUrl,
      recurrence_rule: s.recurrenceRule,
      recurrence_parent_id: s.recurrenceParentId,
    }));

    // The first row is the series parent; the rest point back at it.
    const [first, ...rest] = rows;
    return this.db.transaction().execute(async (trx) => {
      const parent = await trx
        .insertInto('class_sessions')
        .values(first)
        .returningAll()
        .executeTakeFirstOrThrow();

      if (rest.length > 0) {
        await trx
          .insertInto('class_sessions')
          .values(rest.map((r) => ({ ...r, recurrence_parent_id: parent.id })))
          .execute();
      }

      return parent;
    });
  }

  listForBatch(batchId: string) {
    return this.db
      .selectFrom('class_sessions')
      .selectAll()
      .where('batch_id', '=', batchId)
      .orderBy('scheduled_start_utc')
      .execute();
  }

  listForTutorBetween(tutorId: string, from: Date, to: Date) {
    return this.db
      .selectFrom('class_sessions')
      .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
      .select([
        'class_sessions.id',
        'class_sessions.batch_id',
        'class_sessions.scheduled_start_utc',
        'class_sessions.timezone',
        'class_sessions.duration_min',
        'class_sessions.meeting_url',
        'class_sessions.status',
        'batches.title as batch_title',
      ])
      .where('class_sessions.tutor_id', '=', tutorId)
      .where('class_sessions.scheduled_start_utc', '>=', from)
      .where('class_sessions.scheduled_start_utc', '<', to)
      .orderBy('class_sessions.scheduled_start_utc')
      .execute();
  }

  /** Upcoming sessions across every batch a student is enrolled in. */
  listForStudentBetween(studentId: string, from: Date, to: Date) {
    return this.db
      .selectFrom('class_sessions')
      .innerJoin('batches', 'batches.id', 'class_sessions.batch_id')
      .innerJoin(
        'enrollments',
        'enrollments.batch_id',
        'class_sessions.batch_id',
      )
      .select([
        'class_sessions.id',
        'class_sessions.batch_id',
        'class_sessions.scheduled_start_utc',
        'class_sessions.timezone',
        'class_sessions.duration_min',
        'class_sessions.meeting_url',
        'class_sessions.status',
        'batches.title as batch_title',
      ])
      .where('enrollments.student_id', '=', studentId)
      .where('enrollments.status', '=', 'active')
      .where('class_sessions.scheduled_start_utc', '>=', from)
      .where('class_sessions.scheduled_start_utc', '<', to)
      .orderBy('class_sessions.scheduled_start_utc')
      .execute();
  }

  /** Feeds the trial-end value-recap paywall (blueprint §5). */
  async countCompletedForTutor(tutorId: string): Promise<number> {
    const row = await this.db
      .selectFrom('class_sessions')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('tutor_id', '=', tutorId)
      .where('status', '=', 'completed')
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  /** Total minutes of completed class time — the "verified hours" input
   *  to the Proof-of-Teaching score (blueprint §10 Phase 4). */
  async sumCompletedMinutesForTutor(tutorId: string): Promise<number> {
    const row = await this.db
      .selectFrom('class_sessions')
      .select((eb) => eb.fn.sum('duration_min').as('total'))
      .where('tutor_id', '=', tutorId)
      .where('status', '=', 'completed')
      .executeTakeFirstOrThrow();
    return Number(row.total ?? 0);
  }

  /** Any scheduled batch class for this tutor overlapping [start, end) —
   *  lets 1:1 booking creation (blueprint §10 Phase 4) avoid
   *  double-booking a tutor across the two scheduling systems. */
  async hasScheduledOverlapForTutor(
    tutorId: string,
    start: Date,
    end: Date,
  ): Promise<boolean> {
    const row = await this.db
      .selectFrom('class_sessions')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('tutor_id', '=', tutorId)
      .where('status', '=', 'scheduled')
      .where('scheduled_start_utc', '<', end)
      .where(
        sql<boolean>`scheduled_start_utc + (duration_min * interval '1 minute') > ${start}`,
      )
      .executeTakeFirstOrThrow();
    return Number(row.count) > 0;
  }

  updateStatus(id: string, status: 'scheduled' | 'completed' | 'cancelled') {
    return this.db
      .updateTable('class_sessions')
      .set({ status })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Cancels the whole series (the parent and everything pointing at it). */
  cancelSeries(parentId: string) {
    return this.db
      .updateTable('class_sessions')
      .set({ status: 'cancelled' })
      .where((eb) =>
        eb.or([
          eb('id', '=', parentId),
          eb('recurrence_parent_id', '=', parentId),
        ]),
      )
      .execute();
  }
}
