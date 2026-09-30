import { IsIn } from 'class-validator';

const VERIFICATION_STATUSES = ['pending', 'verified', 'rejected'] as const;

export class SetAcademyVerificationStatusDto {
  @IsIn(VERIFICATION_STATUSES)
  status: 'pending' | 'verified' | 'rejected';
}
