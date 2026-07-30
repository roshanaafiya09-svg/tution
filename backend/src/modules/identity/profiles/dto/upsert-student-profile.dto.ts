import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpsertStudentProfileDto {
  @IsString()
  @MaxLength(120)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  gradeLevel?: string;

  @IsOptional()
  @IsUUID()
  curriculumId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  schoolName?: string;
}
