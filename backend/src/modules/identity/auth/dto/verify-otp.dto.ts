import {
  IsIn,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { IsLoginIdentifier } from './identifier.validator';

export class VerifyOtpDto {
  /** Phone number or email — must match what /auth/otp/request was
   *  called with. See RequestOtpDto for why this is optional. */
  @IsOptional()
  @IsLoginIdentifier()
  identifier?: string;

  /** @deprecated Use `identifier`. Kept for the shipped mobile app. */
  @IsOptional()
  @IsPhoneNumber(undefined, {
    message: 'phoneE164 must be a valid E.164 number, e.g. +919876543210',
  })
  phoneE164?: string;

  @IsString()
  @Length(6, 6, { message: 'code must be exactly 6 digits' })
  code!: string;

  /**
   * First-time verification with no existing account creates one — the
   * caller must say which role they're signing up as. `academy` creates
   * the user + role only (see AuthService) — the academy record itself
   * is bootstrapped separately via POST /academy/me once the caller has
   * a token, same lazy-creation pattern as a tutor's profiles_tutor row.
   */
  @IsOptional()
  @IsIn(['tutor', 'student', 'parent', 'academy'])
  signupRole?: 'tutor' | 'student' | 'parent' | 'academy';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceLabel?: string;

  /** Required only when signing up with an email identifier —
   *  `users.phone_e164` is NOT NULL, so an account still needs one. */
  @IsOptional()
  @IsPhoneNumber(undefined, {
    message: 'phone must be a valid E.164 number, e.g. +919876543210',
  })
  phoneForSignup?: string;
}
