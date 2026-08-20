import { Kysely, sql } from 'kysely';

/**
 * Academy Dashboard Navigation/UX update: the Academy Profile page's
 * "Contact Information" section (phone/email/website) has no backing
 * columns yet — `academies` only carries the fields from migration 0030.
 * Purely additive, all nullable, no data migration needed.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    alter table academies
      add column contact_phone text null,
      add column contact_email text null,
      add column website_url text null;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    alter table academies
      drop column if exists contact_phone,
      drop column if exists contact_email,
      drop column if exists website_url;
  `.execute(db);
}
