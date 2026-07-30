import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class CreateTutorSubjectDto {
  @IsUUID()
  subjectId!: string;

  @IsUUID()
  curriculumId!: string;

  @IsInt()
  @Min(1)
  @Max(12)
  gradeMin!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  gradeMax!: number;

  @IsInt()
  @Min(0)
  hourlyRateMinor!: number;
}
