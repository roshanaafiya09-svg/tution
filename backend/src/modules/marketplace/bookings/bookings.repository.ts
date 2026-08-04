import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

export interface NewBooking {
  tutorId: string;
  studentId: string;
  subjectId: string;
  hourlyRateMinor: number;
  amountMinor: number;
  platformFeeMinor: number;
  currency: string;
  scheduledStartUtc: Date;
  timezone: string;
  durationMin: number;
  meetingUrl: string | null;
}

@Injectable()
export class BookingsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  create(input: NewBooking) {
    return this.db
      .insertInto('bookings')
      .values({
        id: newId(),
        tutor_id: input.tutorId,
        student_id: input.studentId,
        subject_id: input.subjectId,
        hourly_rate_minor: input.hourlyRateMinor,
        amount_minor: input.amountMinor,
        platform_fee_minor: input.platformFeeMinor,
        currency: input.currency,
        scheduled_start_utc: input.scheduledStartUtc,
        timezone: input.timezone,
        duration_min: input.durationMin,
        meeting_url: input.meetingUrl,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findById(id: string) {
    return this.db
      .selectFrom('bookings')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  listForStudent(studentId: string) {
    return this.db
      .selectFrom('bookings')
      .selectAll()
      .where('student_id', '=', studentId)
      .orderBy('scheduled_start_utc', 'desc')
      .execute();
  }

  listForTutor(tutorId: string) {
    return this.db
      .selectFrom('bookings')
      .selectAll()
      .where('tutor_id', '=', tutorId)
      .orderBy('scheduled_start_utc', 'desc')
      .execute();
  }

  /** Any non-cancelled booking for this tutor overlapping [start, end) —
   *  the double-booking guard alongside SessionsRepository's equivalent
   *  check against batch class_sessions. */
  async hasOverlapForTutor(
    tutorId: string,
    start: Date,
    end: Date,
  ): Promise<boolean> {
    const row = await this.db
      .selectFrom('bookings')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('tutor_id', '=', tutorId)
      .where('status', '!=', 'cancelled')
      .where('scheduled_start_utc', '<', end)
      .where(
        sql<boolean>`scheduled_start_utc + (duration_min * interval '1 minute') > ${start}`,
      )
      .executeTakeFirstOrThrow();
    return Number(row.count) > 0;
  }

  markConfirmed(id: string) {
    return this.db
      .updateTable('bookings')
      .set({ status: 'confirmed' })
      .where('id', '=', id)
      .where('status', '=', 'pending_payment')
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
