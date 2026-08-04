import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

@Injectable()
export class ReviewsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  /** One review per (tutor, student) — a repeat submission updates the
   *  existing row instead of stacking a duplicate. */
  upsert(
    tutorId: string,
    studentId: string,
    rating: number,
    comment: string | null,
  ) {
    return this.db
      .insertInto('reviews')
      .values({
        id: newId(),
        tutor_id: tutorId,
        student_id: studentId,
        rating,
        comment,
      })
      .onConflict((oc) =>
        oc.columns(['tutor_id', 'student_id']).doUpdateSet({ rating, comment }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findById(id: string) {
    return this.db
      .selectFrom('reviews')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /** Public — feeds the tutor's discovery/SEO page (blueprint §10 Phase 4). */
  listForTutor(tutorId: string) {
    return this.db
      .selectFrom('reviews')
      .leftJoin(
        'profiles_student',
        'profiles_student.user_id',
        'reviews.student_id',
      )
      .select([
        'reviews.id',
        'reviews.rating',
        'reviews.comment',
        'reviews.created_at',
        'profiles_student.display_name as student_display_name',
      ])
      .where('reviews.tutor_id', '=', tutorId)
      .orderBy('reviews.created_at', 'desc')
      .execute();
  }

  listForStudent(studentId: string) {
    return this.db
      .selectFrom('reviews')
      .selectAll()
      .where('student_id', '=', studentId)
      .orderBy('created_at', 'desc')
      .execute();
  }

  /** Public — the aggregate shown alongside a tutor's listing/profile. */
  async aggregateForTutor(tutorId: string) {
    const row = await this.db
      .selectFrom('reviews')
      .select((eb) => [
        eb.fn.countAll().as('count'),
        eb.fn.avg('rating').as('average'),
      ])
      .where('tutor_id', '=', tutorId)
      .executeTakeFirstOrThrow();

    const count = Number(row.count);
    return {
      count,
      average: count === 0 ? null : Math.round(Number(row.average) * 10) / 10,
    };
  }

  deleteById(id: string) {
    return this.db.deleteFrom('reviews').where('id', '=', id).execute();
  }
}
