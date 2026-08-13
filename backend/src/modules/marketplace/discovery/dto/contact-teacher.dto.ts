import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ContactTeacherDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
