import { Kysely, sql } from 'kysely';

/**
 * `telegram_chat_id` (added by 0025) has never had a uniqueness
 * guarantee — application code always intended a strict one-to-one
 * relationship (each account's OTP destination is exactly one Telegram
 * chat), but nothing stopped two rows from ending up with the same
 * value. This makes the database itself refuse that, as defense in
 * depth alongside the application-level checks (TelegramLinkService's
 * self-link guard, and UsersRepository.setTelegramChatId only ever
 * writing when the target account's chat id is still null).
 *
 * Partial on `deleted_at is null` for the same reason as 0026's email
 * index: softDelete() tombstones the row rather than clearing this
 * column, and a deleted account must not permanently reserve a chat id
 * someone else legitimately owns.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create unique index users_telegram_chat_id_unique_idx
      on users(telegram_chat_id)
      where telegram_chat_id is not null and deleted_at is null;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    drop index if exists users_telegram_chat_id_unique_idx;
  `.execute(db);
}
