import { ConflictException, Inject, Injectable } from '@nestjs/common';
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
   *
   * The checks earlier in the signup flow (AuthService, TelegramLinkService)
   * can't see everything Postgres's own unique constraints catch here —
   * concurrent duplicate requests, or the same already-linked Telegram
   * account being reused for a brand-new phone number (its own account
   * has no conflicting phone, so nothing upstream flags it; only the
   * insert itself, against `telegram_chat_id`, does). Left uncaught,
   * that's a raw driver error with no HTTP status, which the app's
   * global exception filter turns into an opaque 500 — translating it
   * here gives the caller something they can actually act on.
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

    try {
      return await this.db.transaction().execute(async (trx) => {
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
    } catch (err) {
      throw translateSignupConflict(err);
    }
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

/** Postgres SQLSTATE 23505 = unique_violation. `pg` attaches `code` and
 *  `constraint` to the thrown error but doesn't export a typed error
 *  class for it, so this is a structural check rather than an
 *  `instanceof`. */
function isUniqueViolation(
  err: unknown,
): err is { code: '23505'; constraint?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === '23505'
  );
}

/** Maps a unique-constraint violation to a clean, specific 409 instead
 *  of leaking a raw driver error up to the global exception filter
 *  (which would otherwise turn it into an opaque 500). Anything that
 *  isn't a unique violation is returned unchanged — this only ever
 *  narrows a known failure mode, never masks a genuine bug. */
function translateSignupConflict(err: unknown): unknown {
  if (!isUniqueViolation(err)) return err;

  switch (err.constraint) {
    case 'users_telegram_chat_id_unique_idx':
      return new ConflictException(
        'This Telegram account is already connected to a different account. Sign in with that account instead, or contact support to reconnect it.',
      );
    case 'users_phone_e164_key':
      return new ConflictException(
        'An account with this phone number already exists — try signing in instead.',
      );
    case 'users_email_unique_idx':
      return new ConflictException(
        'An account with this email already exists — try signing in instead.',
      );
    default:
      return new ConflictException(
        'An account with these details already exists.',
      );
  }
}
