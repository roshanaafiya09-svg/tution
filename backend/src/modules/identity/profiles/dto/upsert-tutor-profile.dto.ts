import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const TEACHING_MODES = ['online', 'offline', 'both'] as const;

export class UpsertTutorProfileDto {
  @IsString()
  @MaxLength(120)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  headline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  yearsExperience?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  qualifications?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  languages?: string[];

  @IsOptional()
  @IsIn(TEACHING_MODES)
  teachingMode?: (typeof TEACHING_MODES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  methodology?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  achievements?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  certifications?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  feeNote?: string;
}
