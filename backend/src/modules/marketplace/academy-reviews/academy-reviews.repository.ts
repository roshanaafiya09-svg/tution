import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

/** Mirrors ReviewsRepository (teacher reviews) exactly, but keyed by
 *  academy_id instead of tutor_id — a separate rating system, never
 *  mixed with individual teacher ratings. */
@Injectable()
export class AcademyReviewsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  /** One review per (academy, student) — a repeat submission updates
   *  the existing row instead of stacking a duplicate. */
  upsert(
    academyId: string,
    studentId: string,
    rating: number,
    comment: string | null,
  ) {
    return this.db
      .insertInto('academy_reviews')
      .values({
        id: newId(),
        academy_id: academyId,
        student_id: studentId,
        rating,
        comment,
      })
      .onConflict((oc) =>
        oc
          .columns(['academy_id', 'student_id'])
          .doUpdateSet({ rating, comment }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  findById(id: string) {
    return this.db
      .selectFrom('academy_reviews')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /** Public — feeds the academy's discovery card/profile page. */
  listForAcademy(academyId: string) {
    return this.db
      .selectFrom('academy_reviews')
      .leftJoin(
        'profiles_student',
        'profiles_student.user_id',
        'academy_reviews.student_id',
      )
      .select([
        'academy_reviews.id',
        'academy_reviews.rating',
        'academy_reviews.comment',
        'academy_reviews.created_at',
        'profiles_student.display_name as student_display_name',
      ])
      .where('academy_reviews.academy_id', '=', academyId)
      .orderBy('academy_reviews.created_at', 'desc')
      .execute();
  }

  listForStudent(studentId: string) {
    return this.db
      .selectFrom('academy_reviews')
      .selectAll()
      .where('student_id', '=', studentId)
      .orderBy('created_at', 'desc')
      .execute();
  }

  /** Public — the aggregate shown alongside an academy's card/profile. */
  async aggregateForAcademy(academyId: string) {
    const row = await this.db
      .selectFrom('academy_reviews')
      .select((eb) => [
        eb.fn.countAll().as('count'),
        eb.fn.avg('rating').as('average'),
      ])
      .where('academy_id', '=', academyId)
      .executeTakeFirstOrThrow();

    const count = Number(row.count);
    return {
      count,
      average: count === 0 ? null : Math.round(Number(row.average) * 10) / 10,
    };
  }

  deleteById(id: string) {
    return this.db.deleteFrom('academy_reviews').where('id', '=', id).execute();
  }
}
