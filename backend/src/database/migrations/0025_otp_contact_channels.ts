import { Kysely, sql } from 'kysely';

/**
 * Email/Telegram OTP delivery needs somewhere to send to — unlike
 * phone_e164 (proven at signup by WhatsApp/console OTP delivery itself),
 * neither an email address nor a Telegram chat exists per-user yet.
 * `email` already exists (added by 0002, previously only used for
 * Google Sign-In linking); this adds its Telegram counterpart. Both stay
 * nullable — phone_e164 remains the sole required account identifier.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    alter table users add column telegram_chat_id text null;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    alter table users drop column telegram_chat_id;
  `.execute(db);
}
