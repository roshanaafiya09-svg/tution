import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GradeSubmissionDto {
  /** Free-form so tutors can use marks, letters, or "Needs work". */
  @IsString()
  @MaxLength(40)
  grade!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  feedback?: string;
}
