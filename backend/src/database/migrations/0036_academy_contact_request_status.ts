import { Kysely, sql } from 'kysely';

/**
 * Minimal status pipeline for academy_contact_requests, on top of the
 * existing read/unread (`read_at`) tracking — the Academy Admin "Contact
 * Requests" MAIN section wants a lightweight New -> Contacted -> Interested
 * -> Joined/Not Interested workflow without becoming a full CRM. `read_at`
 * is untouched and keeps powering the unread badge on Today/the stats
 * endpoint; `status` is a separate, additive field the admin sets by hand.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    alter table academy_contact_requests
      add column status text not null default 'new'
        check (status in ('new', 'contacted', 'interested', 'joined', 'not_interested'));
  `.execute(db);

  // Best-effort backfill: a request the admin already opened is at least
  // "contacted" from their point of view; everything else starts at 'new'
  // (already the column default).
  await db
    .updateTable('academy_contact_requests')
    .set({ status: 'contacted' })
    .where('read_at', 'is not', null)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    alter table academy_contact_requests
      drop column if exists status;
  `.execute(db);
}
