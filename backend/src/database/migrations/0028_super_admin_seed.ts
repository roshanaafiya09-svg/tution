import { Kysely } from 'kysely';
import { newId } from '../id';

const SUPER_ADMIN_EMAIL = 'roshanaafiya09@gmail.com';
const SUPER_ADMIN_PHONE = '+919159172469';
const SUPER_ADMIN_ROLE = 'superadmin';

/**
 * Grants the permanent Super Admin role to a specific, known account.
 * `superadmin` already existed as a role value (see 0002's `user_roles`
 * CHECK constraint) and is already wired into RolesGuard as the
 * top-of-hierarchy role — this migration only ever grants it to one
 * named identity, it doesn't add a new role.
 *
 * Idempotent by construction: looks up the account by email/phone
 * first and only inserts if neither matches, so re-running this (or
 * running it after the account already signed up normally) never
 * creates a duplicate user — it just ensures the role is granted.
 * If a matching account already exists but is missing one of the two
 * identifiers (e.g. an account created by phone during earlier manual
 * testing, with no email on file), that identifier is backfilled —
 * only ever filling a null, never overwriting one that's already set
 * to something else.
 */
export async function up(db: Kysely<any>): Promise<void> {
  const existing = await db
    .selectFrom('users')
    .select(['id', 'email', 'phone_e164'])
    .where((eb) =>
      eb.or([
        eb('email', '=', SUPER_ADMIN_EMAIL),
        eb('phone_e164', '=', SUPER_ADMIN_PHONE),
      ]),
    )
    .executeTakeFirst();

  let userId: string;

  if (existing) {
    userId = existing.id;
    if (!existing.email) {
      await db
        .updateTable('users')
        .set({ email: SUPER_ADMIN_EMAIL })
        .where('id', '=', userId)
        .execute();
    }
  } else {
    userId = newId();
    await db
      .insertInto('users')
      .values({
        id: userId,
        phone_e164: SUPER_ADMIN_PHONE,
        email: SUPER_ADMIN_EMAIL,
        telegram_chat_id: null,
      })
      .execute();
  }

  await db
    .insertInto('user_roles')
    .values({ user_id: userId, role: SUPER_ADMIN_ROLE })
    .onConflict((oc) => oc.columns(['user_id', 'role']).doNothing())
    .execute();
}

/** Revokes the role only — never touches the account's identifiers or
 *  deletes it, since by the time this migration has run in a real
 *  environment the account may be in active use with its own data
 *  attached. Matches by phone as a fallback to email since up() may
 *  have matched an existing phone-only account before backfilling
 *  its email. */
export async function down(db: Kysely<any>): Promise<void> {
  const existing = await db
    .selectFrom('users')
    .select('id')
    .where((eb) =>
      eb.or([
        eb('email', '=', SUPER_ADMIN_EMAIL),
        eb('phone_e164', '=', SUPER_ADMIN_PHONE),
      ]),
    )
    .executeTakeFirst();
  if (!existing) return;

  await db
    .deleteFrom('user_roles')
    .where('user_id', '=', existing.id)
    .where('role', '=', SUPER_ADMIN_ROLE)
    .execute();
}
