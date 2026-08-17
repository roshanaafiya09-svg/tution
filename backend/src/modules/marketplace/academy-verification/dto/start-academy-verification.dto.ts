import { Equals, IsString, MaxLength } from 'class-validator';

/**
 * Step 1 (and only step, in Phase 1 — no KYC provider is wired in yet):
 * records explicit consent before anything is treated as "submitted".
 * `consent` must literally be `true` — there is no "Agree & Continue"
 * without actually agreeing, and a missing/false value is a validation
 * error, not a silently-ignored default.
 */
export class StartAcademyVerificationDto {
  @Equals(true, { message: 'You must agree to continue.' })
  consent!: true;

  @IsString()
  @MaxLength(20)
  policyVersion!: string;
}
