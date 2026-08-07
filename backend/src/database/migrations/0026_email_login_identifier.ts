import { Kysely, sql } from 'kysely';

/**
 * Email becomes a login identifier alongside phone_e164 (OTP can now be
 * requested with either). `users.email` has existed since 0002 but with
 * no unique constraint — it was only ever read by Google Sign-In's
 * account linking, where an ambiguous match was nobody's login. As a
 * login key it has to be unambiguous, hence this index.
 *
 * Partial on `deleted_at is null` because softDelete() (see
 * UsersRepository) tombstones the address rather than clearing the row,
 * and a deleted account must not reserve an address the person may
 * legitimately re-register with later.
 *
 * phone_e164 deliberately stays NOT NULL — every account still has a
 * phone, email is an *additional* identifier. Making phone optional is a
 * larger decision (google-auth.service.ts flags it) and isn't needed here.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create unique index users_email_unique_idx
      on users(email)
      where email is not null and deleted_at is null;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    drop index if exists users_email_unique_idx;
  `.execute(db);
}
