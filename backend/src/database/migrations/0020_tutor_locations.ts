import { Kysely, sql } from 'kysely';

/**
 * Phase 4 marketplace (blueprint §9/§10): the first table of the open
 * marketplace, deliberately built with no FK relationship to
 * bookings/reviews so it can ship and be verified in complete
 * isolation — it's also the one carrying the real infra risk (PostGIS
 * alongside Phase 3's pgvector in the same container, see
 * docker/postgres.Dockerfile).
 *
 * Tutors self-enter lat/lng (no geocoding provider — mock-first, same
 * spirit as every other Phase 4 mock choice); `geog` is derived from
 * lat/lng at write time in the repository (mirrors how
 * material_chunks.embedding is written via a `sql`-tagged cast, not a
 * DB-generated column) so radius search can use a GIST index.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`create extension if not exists postgis;`.execute(db);

  await sql`
    create table tutor_locations (
      tutor_id uuid primary key references users(id) on delete cascade,
      city text not null,
      area_label text null,
      lat double precision not null check (lat between -90 and 90),
      lng double precision not null check (lng between -180 and 180),
      geog geography(Point, 4326) not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index tutor_locations_geog_idx on tutor_locations using gist(geog);
    create index tutor_locations_city_idx on tutor_locations(city);
    create trigger set_updated_at before update on tutor_locations
      for each row execute function set_updated_at();
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists tutor_locations;`.execute(db);
  await sql`drop extension if exists postgis;`.execute(db);
}
