import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../database/database.module';
import type { DB } from '../../database/types';
import { newId } from '../../database/id';

export type SenderRole = 'tutor' | 'student' | 'parent';

@Injectable()
export class MessagesRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  create(
    batchId: string,
    studentId: string,
    senderId: string,
    senderRole: SenderRole,
    body: string,
  ) {
    return this.db
      .insertInto('messages')
      .values({
        id: newId(),
        batch_id: batchId,
        student_id: studentId,
        sender_id: senderId,
        sender_role: senderRole,
        body,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** A thread is keyed by (batch_id, student_id) — every message in it
   *  is visible to the tutor, the student, and any consented parent. */
  listForThread(batchId: string, studentId: string) {
    return this.db
      .selectFrom('messages')
      .leftJoin(
        'profiles_tutor',
        'profiles_tutor.user_id',
        'messages.sender_id',
      )
      .leftJoin(
        'profiles_student',
        'profiles_student.user_id',
        'messages.sender_id',
      )
      .select((eb) => [
        'messages.id',
        'messages.sender_id',
        'messages.sender_role',
        'messages.body',
        'messages.created_at',
        eb.fn
          .coalesce(
            'profiles_tutor.display_name',
            'profiles_student.display_name',
          )
          .as('sender_display_name'),
      ])
      .where('messages.batch_id', '=', batchId)
      .where('messages.student_id', '=', studentId)
      .orderBy('messages.created_at')
      .execute();
  }

  /** One row per (batch, student) thread the tutor has any message in,
   *  most-recently-active first — the tutor's message inbox. */
  listThreadsForTutor(tutorId: string) {
    return this.db
      .selectFrom('messages')
      .innerJoin('batches', 'batches.id', 'messages.batch_id')
      .leftJoin(
        'profiles_student',
        'profiles_student.user_id',
        'messages.student_id',
      )
      .select((eb) => [
        'messages.batch_id',
        'messages.student_id',
        'batches.title as batch_title',
        'profiles_student.display_name as student_display_name',
        eb.fn.max('messages.created_at').as('last_message_at'),
        eb.fn.countAll().as('message_count'),
      ])
      .where('batches.tutor_id', '=', tutorId)
      .groupBy([
        'messages.batch_id',
        'messages.student_id',
        'batches.title',
        'profiles_student.display_name',
      ])
      .orderBy('last_message_at', 'desc')
      .execute();
  }

  /** The student's own inbox — one row per batch thread they're in.
   *  Includes student_id even though it's constant (always the caller's
   *  own id) — callers share the same ThreadSummary shape as
   *  listThreadsForTutor's, which needs it to disambiguate between
   *  different students, and the frontend relies on it always being
   *  present (e.g. as a React key and a display-name fallback). */
  listThreadsForStudent(studentId: string) {
    return this.db
      .selectFrom('messages')
      .innerJoin('batches', 'batches.id', 'messages.batch_id')
      .select((eb) => [
        'messages.batch_id',
        'messages.student_id',
        'batches.title as batch_title',
        eb.fn.max('messages.created_at').as('last_message_at'),
        eb.fn.countAll().as('message_count'),
      ])
      .where('messages.student_id', '=', studentId)
      .groupBy(['messages.batch_id', 'messages.student_id', 'batches.title'])
      .orderBy('last_message_at', 'desc')
      .execute();
  }

  /** Same shape as listThreadsForStudent, for a parent viewing one
   *  child's threads — unlike the student's own inbox, the parent needs
   *  the child's name (they may have more than one), so this adds the
   *  same profiles_student join listThreadsForTutor already uses. Kept
   *  as its own method rather than a param on listThreadsForStudent so
   *  the student's own /messages/mine query is untouched. */
  listThreadsForParentChild(studentId: string) {
    return this.db
      .selectFrom('messages')
      .innerJoin('batches', 'batches.id', 'messages.batch_id')
      .leftJoin(
        'profiles_student',
        'profiles_student.user_id',
        'messages.student_id',
      )
      .select((eb) => [
        'messages.batch_id',
        'messages.student_id',
        'batches.title as batch_title',
        'profiles_student.display_name as student_display_name',
        eb.fn.max('messages.created_at').as('last_message_at'),
        eb.fn.countAll().as('message_count'),
      ])
      .where('messages.student_id', '=', studentId)
      .groupBy([
        'messages.batch_id',
        'messages.student_id',
        'batches.title',
        'profiles_student.display_name',
      ])
      .orderBy('last_message_at', 'desc')
      .execute();
  }
}
