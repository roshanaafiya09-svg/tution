import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB } from '../../../database/types';

@Injectable()
export class TutorLocationsRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  findByTutorId(tutorId: string) {
    return this.db
      .selectFrom('tutor_locations')
      .selectAll()
      .where('tutor_id', '=', tutorId)
      .executeTakeFirst();
  }

  upsert(
    tutorId: string,
    city: string,
    areaLabel: string | null,
    lat: number,
    lng: number,
  ) {
    const geog = pointGeography(lat, lng);
    return this.db
      .insertInto('tutor_locations')
      .values({
        tutor_id: tutorId,
        city,
        area_label: areaLabel,
        lat,
        lng,
        geog,
      })
      .onConflict((oc) =>
        oc.column('tutor_id').doUpdateSet({
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

  /** Nearest tutors within radiusKm, closest first — the geo leg of
   *  discovery search once the density gate is open (Phase 4
   *  DiscoveryModule). */
  searchNear(lat: number, lng: number, radiusKm: number, limit: number) {
    const point = pointGeography(lat, lng);
    return this.db
      .selectFrom('tutor_locations')
      .select(['tutor_id', 'city', 'area_label', 'lat', 'lng'])
      .where(sql<boolean>`ST_DWithin(geog, ${point}, ${radiusKm * 1000})`)
      .orderBy(sql`geog <-> ${point}`)
      .limit(limit)
      .execute();
  }
}

function pointGeography(lat: number, lng: number) {
  return sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
}
