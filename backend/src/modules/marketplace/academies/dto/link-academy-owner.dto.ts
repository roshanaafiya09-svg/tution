import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Superadmin links an academy to its owner's login — see
 *  AcademyAdminService.linkOwner. `identifier` is an email or E.164
 *  phone (same shape as /auth/otp/*). `phoneE164` is only required when
 *  `identifier` is an email AND no account with that email exists yet —
 *  same requirement OTP signup already has, since phone_e164 is NOT
 *  NULL on `users`. */
export class LinkAcademyOwnerDto {
  @IsString()
  @MaxLength(255)
  identifier!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneE164?: string;
}
