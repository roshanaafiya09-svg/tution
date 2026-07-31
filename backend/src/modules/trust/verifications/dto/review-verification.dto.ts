import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const VERIFICATION_REVIEW_STATUSES = ['approved', 'rejected'] as const;
export type VerificationReviewStatus =
  (typeof VERIFICATION_REVIEW_STATUSES)[number];

export class ReviewVerificationDto {
  @IsIn(VERIFICATION_REVIEW_STATUSES, {
    message: `status must be one of: ${VERIFICATION_REVIEW_STATUSES.join(', ')}`,
  })
  status!: VerificationReviewStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
