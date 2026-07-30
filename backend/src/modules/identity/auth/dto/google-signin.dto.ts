import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GoogleSignInDto {
  @IsString()
  idToken!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceLabel?: string;
}
