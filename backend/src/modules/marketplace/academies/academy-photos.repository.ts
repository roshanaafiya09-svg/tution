import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';
import { newId } from '../../../database/id';

@Injectable()
export class AcademyPhotosRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  listForAcademy(academyId: string) {
    return this.db
      .selectFrom('academy_photos')
      .selectAll()
      .where('academy_id', '=', academyId)
      .orderBy('sort_order')
      .orderBy('created_at')
      .execute();
  }

  findById(id: string) {
    return this.db
      .selectFrom('academy_photos')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  add(
    academyId: string,
    objectKey: string,
    caption: string | null,
    sortOrder: number,
  ) {
    return this.db
      .insertInto('academy_photos')
      .values({
        id: newId(),
        academy_id: academyId,
        object_key: objectKey,
        caption,
        sort_order: sortOrder,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  remove(id: string) {
    return this.db.deleteFrom('academy_photos').where('id', '=', id).execute();
  }

  setSortOrder(id: string, sortOrder: number) {
    return this.db
      .updateTable('academy_photos')
      .set({ sort_order: sortOrder })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
