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
   *  check against batch class_sessions. `excludeBookingId` lets a
   *  reschedule check against every *other* booking without always
   *  colliding with itself. */
  async hasOverlapForTutor(
    tutorId: string,
    start: Date,
    end: Date,
    excludeBookingId?: string,
  ): Promise<boolean> {
    let query = this.db
      .selectFrom('bookings')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('tutor_id', '=', tutorId)
      .where('status', '!=', 'cancelled')
      .where('scheduled_start_utc', '<', end)
      .where(
        sql<boolean>`scheduled_start_utc + (duration_min * interval '1 minute') > ${start}`,
      );
    if (excludeBookingId) {
      query = query.where('id', '!=', excludeBookingId);
    }
    const row = await query.executeTakeFirstOrThrow();
    return Number(row.count) > 0;
  }

  /** The 1:1-booking half of the "verified session" gate for reviews
   *  (blueprint §10 Phase 4) — the batch-class half is
   *  AttendanceRepository.hasVerifiedAttendanceWithTutor(). */
  async hasCompletedBetween(
    tutorId: string,
    studentId: string,
  ): Promise<boolean> {
    const row = await this.db
      .selectFrom('bookings')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('tutor_id', '=', tutorId)
      .where('student_id', '=', studentId)
      .where('status', '=', 'completed')
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

  /** original_scheduled_start_utc is set once, on the first reschedule
   *  only — later reschedules must not overwrite the booking's true
   *  original time. */
  rescheduleTo(
    id: string,
    scheduledStartUtc: Date,
    originalScheduledStartUtc: Date,
  ) {
    return this.db
      .updateTable('bookings')
      .set((eb) => ({
        scheduled_start_utc: scheduledStartUtc,
        original_scheduled_start_utc: eb.fn.coalesce(
          'original_scheduled_start_utc',
          eb.val(originalScheduledStartUtc),
        ),
        reschedule_count: eb('reschedule_count', '+', 1),
      }))
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  markCancelled(
    id: string,
    cancelledBy: 'student' | 'tutor',
    reason: string | null,
    refundPercent: number | null,
  ) {
    return this.db
      .updateTable('bookings')
      .set({
        status: 'cancelled',
        cancelled_by: cancelledBy,
        cancellation_reason: reason,
        refund_percent: refundPercent,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  markCompleted(id: string) {
    return this.db
      .updateTable('bookings')
      .set({ status: 'completed' })
      .where('id', '=', id)
      .where('status', '=', 'confirmed')
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Student didn't show — tutor keeps the payment, no refund. A
   *  tutor no-show instead goes through cancel() (cancelledBy: 'tutor'),
   *  which is always a full refund. */
  markNoShow(id: string) {
    return this.db
      .updateTable('bookings')
      .set({ status: 'no_show', refund_percent: 0 })
      .where('id', '=', id)
      .where('status', '=', 'confirmed')
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
