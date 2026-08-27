import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

@Injectable()
export class AnnouncementsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  create(batchId: string, tutorId: string, body: string) {
    return this.db
      .insertInto('announcements')
      .values({ id: newId(), batch_id: batchId, tutor_id: tutorId, body })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  listForBatch(batchId: string) {
    return this.db
      .selectFrom('announcements')
      .selectAll()
      .where('batch_id', '=', batchId)
      .orderBy('created_at', 'desc')
      .execute();
  }

  /** Bulk sibling of listForBatch — announcements across a set of batches
   *  in one query, backing the Student Dashboard's "mine" endpoint
   *  (previously one /announcements/batch/:id call per enrolled batch). */
  listForBatches(batchIds: string[]) {
    return this.db
      .selectFrom('announcements')
      .selectAll()
      .where(
        'batch_id',
        'in',
        batchIds.length ? batchIds : ['00000000-0000-0000-0000-000000000000'],
      )
      .orderBy('created_at', 'desc')
      .execute();
  }

  /** Active student IDs for a batch — the notification fan-out target. */
  listBatchStudentIds(batchId: string) {
    return this.db
      .selectFrom('enrollments')
      .select('student_id')
      .where('batch_id', '=', batchId)
      .where('status', '=', 'active')
      .execute()
      .then((rows) => rows.map((r) => r.student_id));
  }
}
