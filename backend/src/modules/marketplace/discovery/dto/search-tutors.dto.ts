import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const TEACHING_MODES = ['online', 'offline', 'both'] as const;

/** "Recently Joined" needs no new field — `profiles_tutor.created_at`
 *  already exists. "Most Experienced"/"Lowest Fee" are similarly derived
 *  from columns already selected for the search response. */
const SORT_MODES = [
  'recommended',
  'rating',
  'experience',
  'fee',
  'recent',
] as const;

export class SearchTutorsDto {
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  curriculumId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(13)
  grade?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  language?: string;

  @IsOptional()
  @IsIn(TEACHING_MODES)
  teachingMode?: (typeof TEACHING_MODES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  minExperience?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  feeMaxMinor?: number;

  /** Half-star granularity (e.g. "4.5+ stars") is a normal rating-filter
   *  UX, so this allows one decimal place — @IsInt() would reject the
   *  UI's own 4.5 option on every request. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(1)
  @Max(5)
  minRating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  radiusKm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsIn(SORT_MODES)
  sort?: (typeof SORT_MODES)[number];
}
