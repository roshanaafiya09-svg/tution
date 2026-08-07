import {
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
} from 'class-validator';

export class RequestOtpDto {
  @IsPhoneNumber(undefined, {
    message: 'phone must be a valid E.164 number, e.g. +919876543210',
  })
  phoneE164!: string;

  /**
   * Where to deliver the code when the active OtpProvider is Email or
   * Telegram (ignored by WhatsApp/console). Optional if this phone
   * number already has a contact on file — see AuthService.requestOtp.
   */
  @IsOptional()
  @IsEmail(undefined, { message: 'email must be a valid email address' })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  telegramChatId?: string;
}
