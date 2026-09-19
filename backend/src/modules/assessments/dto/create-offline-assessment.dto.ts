import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { IsCalendarDate } from './is-calendar-date.decorator';

export class CreateOfflineAssessmentDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsUUID()
  subjectId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  batchIds!: string[];

  /** Local calendar date (Asia/Kolkata), e.g. "2026-09-20". */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'assessmentDate must be a date in YYYY-MM-DD form',
  })
  @IsCalendarDate()
  assessmentDate!: string;

  @IsInt()
  @Min(1)
  maxScore!: number;
}
