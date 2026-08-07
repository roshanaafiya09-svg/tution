import { IsOptional, IsPhoneNumber } from 'class-validator';
import { IsLoginIdentifier } from './identifier.validator';

export class RequestOtpDto {
  /**
   * Phone number or email address. Optional *only* because `phoneE164`
   * is still accepted as a deprecated alias for the existing Flutter
   * app — the controller requires exactly one of the two.
   */
  @IsOptional()
  @IsLoginIdentifier()
  identifier?: string;

  /** @deprecated Use `identifier`. Kept so the shipped mobile app keeps
   *  working against this endpoint unchanged. */
  @IsOptional()
  @IsPhoneNumber(undefined, {
    message: 'phoneE164 must be a valid E.164 number, e.g. +919876543210',
  })
  phoneE164?: string;
}
