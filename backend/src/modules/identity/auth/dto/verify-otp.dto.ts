import {
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
  @IsIn(['tutor', 'student'])
  signupRole?: 'tutor' | 'student';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceLabel?: string;
}
