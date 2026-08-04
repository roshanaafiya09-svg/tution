import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

@Injectable()
export class WaitlistsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  create(tutorSubjectId: string, tutorId: string, studentId: string) {
    return this.db
      .insertInto('booking_waitlists')
      .values({
        id: newId(),
        tutor_subject_id: tutorSubjectId,
        tutor_id: tutorId,
        student_id: studentId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** The partial unique index enforces this at the DB level too — this
   *  check exists to return a clear 400 instead of a raw constraint
   *  violation. */
  findActiveForStudentAndTutorSubject(
    tutorSubjectId: string,
    studentId: string,
  ) {
    return this.db
      .selectFrom('booking_waitlists')
      .selectAll()
      .where('tutor_subject_id', '=', tutorSubjectId)
      .where('student_id', '=', studentId)
      .where('status', 'in', ['waiting', 'notified'])
      .executeTakeFirst();
  }

  findById(id: string) {
    return this.db
      .selectFrom('booking_waitlists')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  listForStudent(studentId: string) {
    return this.db
      .selectFrom('booking_waitlists')
      .selectAll()
      .where('student_id', '=', studentId)
      .orderBy('created_at', 'desc')
      .execute();
  }

  markCancelled(id: string) {
    return this.db
      .updateTable('booking_waitlists')
      .set({ status: 'cancelled' })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Fans a freed slot out to every 'waiting' entry for this offering —
   *  returns the affected rows so the caller can notify each student. */
  markWaitingAsNotified(tutorSubjectId: string, expiresAt: Date) {
    return this.db
      .updateTable('booking_waitlists')
      .set({
        status: 'notified',
        notified_at: new Date(),
        expires_at: expiresAt,
      })
      .where('tutor_subject_id', '=', tutorSubjectId)
      .where('status', '=', 'waiting')
      .returningAll()
      .execute();
  }

  markConverted(id: string, bookingId: string) {
    return this.db
      .updateTable('booking_waitlists')
      .set({ status: 'converted', converted_booking_id: bookingId })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  markExpired(id: string) {
    return this.db
      .updateTable('booking_waitlists')
      .set({ status: 'expired' })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Lazy expiry (no job scheduler in this codebase) — opportunistically
   *  flips any of this student's stale 'notified' entries before they're
   *  read, so an expired slot never looks still-claimable. */
  expireStaleForStudent(studentId: string) {
    return this.db
      .updateTable('booking_waitlists')
      .set({ status: 'expired' })
      .where('student_id', '=', studentId)
      .where('status', '=', 'notified')
      .where('expires_at', '<', new Date())
      .execute();
  }
}
