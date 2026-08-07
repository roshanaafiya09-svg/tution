import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB, UserRole } from '../../../database/types';
import { newId } from '../../../database/id';

@Injectable()
export class UsersRepository {
  constructor(@Inject(KYSELY_CONNECTION) private readonly db: Kysely<DB>) {}

  findByPhone(phoneE164: string) {
    return this.db
      .selectFrom('users')
      .selectAll()
      .where('phone_e164', '=', phoneE164)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  }

  findByEmail(email: string) {
    return this.db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', email)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  }

  findById(id: string) {
    return this.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  }

  async createWithRole(
    phoneE164: string,
    role: UserRole,
    contact?: { email?: string; telegramChatId?: string },
  ) {
    return this.db.transaction().execute(async (trx) => {
      const user = await trx
        .insertInto('users')
        .values({
          id: newId(),
          phone_e164: phoneE164,
          email: contact?.email ?? null,
          telegram_chat_id: contact?.telegramChatId ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .insertInto('user_roles')
        .values({ user_id: user.id, role })
        .execute();

      return user;
    });
  }

  /** Self-service contact update for an already-authenticated user (see
   *  POST /auth/contact) — distinct from the contact captured at signup
   *  in createWithRole, which is only ever the field an OTP delivery
   *  itself proved control of. Only supplied fields are touched. */
  updateContact(
    userId: string,
    contact: { email?: string; telegramChatId?: string },
  ) {
    const updates: { email?: string; telegram_chat_id?: string } = {};
    if (contact.email !== undefined) updates.email = contact.email;
    if (contact.telegramChatId !== undefined) {
      updates.telegram_chat_id = contact.telegramChatId;
    }
    if (Object.keys(updates).length === 0) return Promise.resolve();

    return this.db
      .updateTable('users')
      .set(updates)
      .where('id', '=', userId)
      .execute();
  }

  getRoles(userId: string) {
    return this.db
      .selectFrom('user_roles')
      .select('role')
      .where('user_id', '=', userId)
      .execute()
      .then((rows) => rows.map((r) => r.role));
  }

  /** Feeds the Phase 4 density gate (blueprint §10): "≥25 active tutors +
   *  250 active students". "Active" here means a non-deleted account in
   *  good standing, same bar as sign-in eligibility — no separate
   *  recent-activity window exists anywhere else in this codebase to
   *  reuse. */
  async countActiveByRole(role: UserRole): Promise<number> {
    const row = await this.db
      .selectFrom('user_roles')
      .innerJoin('users', 'users.id', 'user_roles.user_id')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('user_roles.role', '=', role)
      .where('users.status', '=', 'active')
      .where('users.deleted_at', 'is', null)
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  /**
   * DPDP Act 2023 data-principal deletion right (blueprint §4/§9). A hard
   * delete would break referential integrity for historical records this
   * user appears in (attendance, fee ledger, audit logs) that other
   * parties legitimately still need — so this tombstones the contactable
   * identity instead: phone/email are replaced so the number/address can
   * be reused, sign-in becomes impossible, and `deleted_at`-gated finders
   * (findByPhone/findByEmail/findById above) stop returning the account.
   */
  softDelete(userId: string) {
    return this.db
      .updateTable('users')
      .set({
        phone_e164: `deleted-${userId}`,
        email: null,
        status: 'deleted',
        deleted_at: new Date(),
      })
      .where('id', '=', userId)
      .execute();
  }
}
