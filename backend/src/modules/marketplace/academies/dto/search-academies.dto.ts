import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

const TEACHING_MODES = ['online', 'offline', 'both'] as const;

/** Smaller set than SearchTutorsDto's — academies have no experience-years
 *  or a single fee concept, so "Most Experienced"/"Lowest Fee" don't map. */
const SORT_MODES = ['recommended', 'rating', 'recent'] as const;

export class SearchAcademiesDto {
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
  @IsIn(TEACHING_MODES)
  teachingMode?: (typeof TEACHING_MODES)[number];

  /** Half-star granularity (e.g. "4.5+ stars") — mirrors
   *  SearchTutorsDto.minRating exactly. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(1)
  @Max(5)
  minRating?: number;

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
