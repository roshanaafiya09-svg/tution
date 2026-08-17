import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * A reviewer can never set 'pending' (that's the only state a new
 * submission creates itself) — every reviewer action is a real decision:
 * an explicit hold (under_review), a terminal outcome (verified/
 * rejected), or a hand-off to closer inspection (needs_manual_review).
 */
export const ACADEMY_VERIFICATION_REVIEW_STATUSES = [
  'under_review',
  'verified',
  'rejected',
  'needs_manual_review',
] as const;
export type AcademyVerificationReviewStatus =
  (typeof ACADEMY_VERIFICATION_REVIEW_STATUSES)[number];

export class ReviewAcademyVerificationDto {
  @IsIn(ACADEMY_VERIFICATION_REVIEW_STATUSES, {
    message: `status must be one of: ${ACADEMY_VERIFICATION_REVIEW_STATUSES.join(', ')}`,
  })
  status!: AcademyVerificationReviewStatus;

  /** Required for anything other than a clean approval — shown back to
   *  the academy owner as "why", so a rejection/manual-review with no
   *  reason is a validation error, not a silent black box. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
