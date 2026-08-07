import {
  IsEmail,
  IsIn,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class VerifyOtpDto {
  @IsPhoneNumber(undefined, {
    message: 'phone must be a valid E.164 number, e.g. +919876543210',
  })
  phoneE164!: string;

  @IsString()
  @Length(6, 6, { message: 'code must be exactly 6 digits' })
  code!: string;

  /**
   * First-time verification with no existing account creates one — the
   * caller must say which role they're signing up as.
   */
  @IsOptional()
  @IsIn(['tutor', 'student', 'parent'])
  signupRole?: 'tutor' | 'student' | 'parent';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceLabel?: string;

  /**
   * Should match whatever was sent to /auth/otp/request — on first-time
   * signup, only the field matching the active OTP channel actually gets
   * persisted onto the new account (see AuthService.verifyOtpAndIssueTokens).
   */
  @IsOptional()
  @IsEmail(undefined, { message: 'email must be a valid email address' })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  telegramChatId?: string;
}
