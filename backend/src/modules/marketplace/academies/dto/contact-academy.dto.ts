import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ContactAcademyDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
