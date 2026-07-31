import { IsString, MaxLength } from 'class-validator';

export class RecordConsentDto {
  /** Free-form (e.g. "terms_of_service", "privacy_policy") — no fixed enum yet. */
  @IsString()
  @MaxLength(60)
  consentType!: string;

  @IsString()
  @MaxLength(20)
  policyVersion!: string;
}
