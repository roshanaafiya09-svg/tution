import { Kysely, sql } from 'kysely';

/**
 * Find an Academy: an academy is a separate org entity from a tutor,
 * connected via academy_memberships — a tutor can be independent-only,
 * academy-only, or both, and can belong to multiple academies. No
 * duplicate teacher profiles are created per academy; membership just
 * links an existing profiles_tutor row to an academy.
 *
 * Subjects/classes offered by an academy are deliberately NOT a table
 * here — derived at read time from active memberships -> tutor_subjects,
 * same "derived signal, no table of its own" pattern as
 * DiscoveryRepository/ProofOfTeachingService.
 *
 * academy_reviews is a separate rating system from `reviews` — academy
 * trust signals and individual-teacher trust signals must not mix.
 *
 * No academy-admin/owner role exists yet (academies are superadmin-
 * managed only, see AcademyAdminController) — academy_contact_requests
 * is therefore persist-only, with no NotificationsService fan-out, until
 * a real Academy Dashboard/owner role exists (known gap, tracked here).
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table academies (
      id uuid primary key,
      name text not null,
      slug text not null unique,
      tagline text null,
      description text null,
      methodology text null,
      years_established int null check (years_established between 1900 and 2100),
      achievements text null,
      certifications text null,
      teaching_mode text null
        check (teaching_mode in ('online', 'offline', 'both')),
      logo_object_key text null,
      cover_object_key text null,
      verification_status text not null default 'pending'
        check (verification_status in ('pending', 'verified', 'rejected')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create trigger set_updated_at before update on academies
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    create table academy_locations (
      academy_id uuid primary key references academies(id) on delete cascade,
      city text not null,
      area_label text null,
      lat double precision not null check (lat between -90 and 90),
      lng double precision not null check (lng between -180 and 180),
      geog geography(Point, 4326) not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index academy_locations_geog_idx on academy_locations using gist(geog);
    create index academy_locations_city_idx on academy_locations(city);
    create trigger set_updated_at before update on academy_locations
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    create table academy_memberships (
      id uuid primary key,
      academy_id uuid not null references academies(id) on delete cascade,
      tutor_id uuid not null references users(id) on delete cascade,
      status text not null default 'active' check (status in ('active', 'left')),
      joined_at timestamptz not null default now(),
      left_at timestamptz null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create unique index academy_memberships_active_uq
      on academy_memberships(academy_id, tutor_id) where status = 'active';
    create index academy_memberships_academy_id_idx on academy_memberships(academy_id);
    create index academy_memberships_tutor_id_idx on academy_memberships(tutor_id);
    create trigger set_updated_at before update on academy_memberships
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    create table academy_photos (
      id uuid primary key,
      academy_id uuid not null references academies(id) on delete cascade,
      object_key text not null,
      caption text null,
      sort_order int not null default 0,
      created_at timestamptz not null default now()
    );
    create index academy_photos_academy_id_idx on academy_photos(academy_id);
  `.execute(db);

  await sql`
    create table academy_reviews (
      id uuid primary key,
      academy_id uuid not null references academies(id) on delete cascade,
      student_id uuid not null references users(id) on delete cascade,
      rating smallint not null check (rating between 1 and 5),
      comment text null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (academy_id, student_id)
    );
    create index academy_reviews_academy_id_idx on academy_reviews(academy_id);
    create trigger set_updated_at before update on academy_reviews
      for each row execute function set_updated_at();
  `.execute(db);

  await sql`
    -- No academy-owner user to notify yet (no Academy Dashboard) — persist
    -- only, surfaced to superadmin via GET /admin/academies/:id/contact-requests.
    create table academy_contact_requests (
      id uuid primary key,
      academy_id uuid not null references academies(id) on delete cascade,
      requester_id uuid not null references users(id) on delete cascade,
      requester_role text not null check (requester_role in ('student', 'parent')),
      message text null,
      read_at timestamptz null,
      created_at timestamptz not null default now()
    );
    create index academy_contact_requests_academy_id_idx on academy_contact_requests(academy_id);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists academy_contact_requests;`.execute(db);
  await sql`drop table if exists academy_reviews;`.execute(db);
  await sql`drop table if exists academy_photos;`.execute(db);
  await sql`drop table if exists academy_memberships;`.execute(db);
  await sql`drop table if exists academy_locations;`.execute(db);
  await sql`drop table if exists academies;`.execute(db);
}
