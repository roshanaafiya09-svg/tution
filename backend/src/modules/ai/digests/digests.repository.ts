import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

export interface NewDigest {
  parentId: string;
  studentId: string;
  periodStart: string;
  periodEnd: string;
  locale: string;
  narrative: string;
  stats: Record<string, unknown>;
}

@Injectable()
export class DigestsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  /** Backs idempotent generation — unique(parent_id, student_id, period_start). */
  findExisting(parentId: string, studentId: string, periodStart: string) {
    return this.db
      .selectFrom('digests')
      .selectAll()
      .where('parent_id', '=', parentId)
      .where('student_id', '=', studentId)
      .where('period_start', '=', periodStart)
      .executeTakeFirst();
  }

  create(entry: NewDigest) {
    return this.db
      .insertInto('digests')
      .values({
        id: newId(),
        parent_id: entry.parentId,
        student_id: entry.studentId,
        period_start: entry.periodStart,
        period_end: entry.periodEnd,
        locale: entry.locale,
        narrative: entry.narrative,
        stats: JSON.stringify(entry.stats),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  listForParent(parentId: string) {
    return this.db
      .selectFrom('digests')
      .selectAll()
      .where('parent_id', '=', parentId)
      .orderBy('period_start', 'desc')
      .execute();
  }
}
