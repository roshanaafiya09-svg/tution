import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';
import type { CreateTutorSubjectDto } from './dto/create-tutor-subject.dto';

@Injectable()
export class TutorSubjectsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  listForTutor(tutorId: string) {
    return this.db
      .selectFrom('tutor_subjects')
      .selectAll()
      .where('tutor_id', '=', tutorId)
      .orderBy('created_at')
      .execute();
  }

  findById(id: string) {
    return this.db
      .selectFrom('tutor_subjects')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /** A tutor can have more than one offering for the same subject
   *  (different curricula/grade bands), so this returns every match —
   *  used by booking cancellation to notify every matching waitlist,
   *  not just one (blueprint §10 Phase 4). */
  listForTutorAndSubject(tutorId: string, subjectId: string) {
    return this.db
      .selectFrom('tutor_subjects')
      .selectAll()
      .where('tutor_id', '=', tutorId)
      .where('subject_id', '=', subjectId)
      .execute();
  }

  create(tutorId: string, dto: CreateTutorSubjectDto) {
    return this.db
      .insertInto('tutor_subjects')
      .values({
        id: newId(),
        tutor_id: tutorId,
        subject_id: dto.subjectId,
        curriculum_id: dto.curriculumId,
        grade_min: dto.gradeMin,
        grade_max: dto.gradeMax,
        hourly_rate_minor: dto.hourlyRateMinor,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  delete(id: string) {
    return this.db.deleteFrom('tutor_subjects').where('id', '=', id).execute();
  }
}
