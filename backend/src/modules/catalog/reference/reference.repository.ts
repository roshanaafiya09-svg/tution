import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';

@Injectable()
export class ReferenceRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  listCurricula() {
    return this.db
      .selectFrom('curricula')
      .selectAll()
      .orderBy('name')
      .execute();
  }

  listGradeLevels(curriculumId: string) {
    return this.db
      .selectFrom('grade_levels')
      .selectAll()
      .where('curriculum_id', '=', curriculumId)
      .orderBy('ordinal')
      .execute();
  }

  listSubjects() {
    return this.db.selectFrom('subjects').selectAll().orderBy('slug').execute();
  }
}
