import { IsEmail } from 'class-validator';

/** POST /auth/contact — self-service email update for a signed-in user.
 *  Deliberately cannot set telegram_chat_id: that only ever comes from
 *  Telegram itself via the linking flow, never from a client. */
export class UpdateContactDto {
  @IsEmail(undefined, { message: 'email must be a valid email address' })
  email!: string;
}
