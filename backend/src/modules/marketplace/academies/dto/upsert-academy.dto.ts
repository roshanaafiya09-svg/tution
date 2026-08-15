import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const TEACHING_MODES = ['online', 'offline', 'both'] as const;

/** Shared by both AcademyAdminController (superadmin create/update of any
 *  academy) and AcademyOwnerController (self-serve owner bootstrap via
 *  POST /academy/me, and profile edit via PUT /academy/me/profile) — only
 *  `name` is required, so the bootstrap call can send just that and fill
 *  in everything else later. Location fields are optional and, when
 *  present, are upserted into academy_locations alongside the academies
 *  row itself (one endpoint, not a separate self-service location flow
 *  like tutors have). */
export class UpsertAcademyDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tagline?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  methodology?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  yearsEstablished?: number;

  @IsOptional()
  @IsString()
  achievements?: string;

  @IsOptional()
  @IsString()
  certifications?: string;

  @IsOptional()
  @IsIn(TEACHING_MODES)
  teachingMode?: (typeof TEACHING_MODES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  areaLabel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;
}
