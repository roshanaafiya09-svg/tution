import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_CONNECTION } from '../../../database/database.module';
import type { DB, UserRole } from '../../../database/types';
import { newId } from '../../../database/id';
import { identifierType } from '../identifier.util';

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

  /** Resolves a login identifier (phone or email — see
   *  identifier.util.ts) to an account, whichever column it lives in. */
  findByIdentifier(identifier: string) {
    return identifierType(identifier) === 'email'
      ? this.findByEmail(identifier)
      : this.findByPhone(identifier);
  }

  findById(id: string) {
    return this.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  }

  /**
   * Creates an account from whichever identifier signup was driven by.
   * phone_e164 is NOT NULL, so an email-identified signup still needs a
   * phone — callers pass `phoneE164` explicitly for that case rather
   * than this method inventing a placeholder.
   */
  async createWithRole(
    identifier: string,
    role: UserRole,
    telegramChatId: string,
    phoneE164?: string,
  ) {
    const isEmail = identifierType(identifier) === 'email';
    const phone = isEmail ? phoneE164 : identifier;
    if (!phone) {
      throw new Error('createWithRole needs a phone number');
    }

    return this.db.transaction().execute(async (trx) => {
      const user = await trx
        .insertInto('users')
        .values({
          id: newId(),
          phone_e164: phone,
          email: isEmail ? identifier : null,
          telegram_chat_id: telegramChatId,
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

  /** Editable profile field for an already-authenticated user (see
   *  POST /auth/contact). Deliberately cannot touch telegram_chat_id —
   *  that only ever comes from Telegram itself via the linking flow, so
   *  a client can't claim someone else's chat. */
  updateEmail(userId: string, email: string) {
    return this.db
      .updateTable('users')
      .set({ email })
      .where('id', '=', userId)
      .execute();
  }

  /** Only ever called with a chat id Telegram itself reported to the
   *  updates poller — never a client-supplied value. */
  setTelegramChatId(userId: string, telegramChatId: string) {
    return this.db
      .updateTable('users')
      .set({ telegram_chat_id: telegramChatId })
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
