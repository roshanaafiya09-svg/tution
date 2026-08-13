import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';

/** Mirrors TutorLocationsRepository exactly, keyed by academy_id
 *  instead of tutor_id. */
@Injectable()
export class AcademyLocationsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  findByAcademyId(academyId: string) {
    return this.db
      .selectFrom('academy_locations')
      .selectAll()
      .where('academy_id', '=', academyId)
      .executeTakeFirst();
  }

  upsert(
    academyId: string,
    city: string,
    areaLabel: string | null,
    lat: number,
    lng: number,
  ) {
    const geog = pointGeography(lat, lng);
    return this.db
      .insertInto('academy_locations')
      .values({
        academy_id: academyId,
        city,
        area_label: areaLabel,
        lat,
        lng,
        geog,
      })
      .onConflict((oc) =>
        oc.column('academy_id').doUpdateSet({
          city,
          area_label: areaLabel,
          lat,
          lng,
          geog,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}

function pointGeography(lat: number, lng: number) {
  return sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
}
