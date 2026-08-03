import { IsString, MaxLength } from 'class-validator';

export class GrantConsentDto {
  @IsString()
  @MaxLength(20)
  policyVersion!: string;
}
