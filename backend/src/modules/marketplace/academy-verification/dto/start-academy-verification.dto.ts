import {
  Equals,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const PAN_FORMAT = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z][Z][0-9A-Z]$/;

/**
 * Records explicit consent, then submits the owner's PAN (required —
 * the owner-identity check this phase automates) and the academy's
 * GSTIN (optional — not every academy has one yet; a submission
 * without it just skips the business-verification half and a reviewer
 * can ask for it later). `consent` must literally be `true` — there is
 * no "Agree & Continue" without actually agreeing, and a missing/false
 * value is a validation error, not a silently-ignored default.
 */
export class StartAcademyVerificationDto {
  @Equals(true, { message: 'You must agree to continue.' })
  consent!: true;

  @IsString()
  @MaxLength(20)
  policyVersion!: string;

  @IsString()
  @Matches(PAN_FORMAT, { message: 'Enter a valid PAN (e.g. ABCDE1234F).' })
  pan!: string;

  @IsOptional()
  @IsString()
  @Matches(GSTIN_FORMAT, { message: 'Enter a valid 15-character GSTIN.' })
  gstin?: string;
}
