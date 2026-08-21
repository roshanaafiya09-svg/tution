import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const TEACHING_MODES = ['online', 'offline', 'both'] as const;

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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  subjects?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  languages?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsIn(TEACHING_MODES)
  teachingMode?: (typeof TEACHING_MODES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  learningGoals?: string;
}
