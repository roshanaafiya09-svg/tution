import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

export interface NewMaterial {
  batchId: string;
  tutorId: string;
  title: string;
  objectKey: string;
  mime: string;
  sizeBytes: number;
}

@Injectable()
export class MaterialsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  create(input: NewMaterial) {
    return this.db
      .insertInto('materials')
      .values({
        id: newId(),
        batch_id: input.batchId,
        tutor_id: input.tutorId,
        title: input.title,
        object_key: input.objectKey,
        mime: input.mime,
        size_bytes: input.sizeBytes,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  listForBatch(batchId: string) {
    return this.db
      .selectFrom('materials')
      .selectAll()
      .where('batch_id', '=', batchId)
      .orderBy('created_at', 'desc')
      .execute();
  }

  /** Bulk sibling of listForBatch — materials across a set of batches in
   *  one query, backing the Student Dashboard's "mine" endpoint. */
  listForBatches(batchIds: string[]) {
    return this.db
      .selectFrom('materials')
      .selectAll()
      .where(
        'batch_id',
        'in',
        batchIds.length ? batchIds : ['00000000-0000-0000-0000-000000000000'],
      )
      .orderBy('created_at', 'desc')
      .execute();
  }

  findById(id: string) {
    return this.db
      .selectFrom('materials')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  delete(id: string) {
    return this.db.deleteFrom('materials').where('id', '=', id).execute();
  }
}
