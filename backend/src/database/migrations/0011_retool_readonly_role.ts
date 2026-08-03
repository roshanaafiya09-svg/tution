import { Kysely, sql } from 'kysely';

/**
 * Read-only Postgres role for Retool to connect to directly for admin
 * browsing (blueprint §4 Platform row: "Retool over Postgres + internal
 * API"). Deliberately SELECT-only — every admin *write* must keep going
 * through the existing authenticated REST API, which writes to the
 * append-only audit_logs table (0006_billing_and_platform.ts). A direct
 * Retool SQL mutation against this role would bypass that trail entirely.
 *
 * No password is set here — CREATE ROLE ... WITH LOGIN has none. Set one
 * manually per environment, out of band, never committed:
 *   ALTER ROLE retool_readonly WITH PASSWORD '<generated-secret>';
 * This mirrors how JWT_ACCESS_SECRET etc. are handled (generated
 * out-of-band, never defaulted in a migration file).
 *
 * Prod caveat: CREATE ROLE needs the migrating role to have CREATEROLE.
 * The local docker-compose `tuition` role has it (DB superuser locally);
 * a managed prod Postgres (RDS, Neon, etc.) may not grant that to the
 * app's own role. If `npm run migrate:up` fails here in prod, run this
 * file's SQL manually as the DB admin instead, then mark the migration
 * applied in Kysely's migration-tracking table.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    do $$ begin
      create role retool_readonly with login;
    exception when duplicate_object then null;
    end $$;
  `.execute(db);

  // GRANT CONNECT ON DATABASE needs a literal identifier, not an
  // expression — current_database() has to go through dynamic SQL.
  await sql`
    do $$ begin
      execute format(
        'grant connect on database %I to retool_readonly',
        current_database()
      );
    end $$;
  `.execute(db);

  await sql`
    grant usage on schema public to retool_readonly;
    grant select on all tables in schema public to retool_readonly;
    alter default privileges in schema public
      grant select on tables to retool_readonly;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    revoke all privileges on all tables in schema public from retool_readonly;
  `.execute(db);
  await sql`
    alter default privileges in schema public
      revoke select on tables from retool_readonly;
  `.execute(db);
  await sql`drop owned by retool_readonly;`.execute(db);
  await sql`drop role if exists retool_readonly;`.execute(db);
}
