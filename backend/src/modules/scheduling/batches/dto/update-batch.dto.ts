import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

/** Every field optional — a partial update, unlike CreateBatchDto. New
 *  capability (previously only `archive` existed); see
 *  dashboard_uiux_redesign memory's backend-follow-ups list. */
export class UpdateBatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  gradeLevelId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  feeMinor?: number;

  @IsOptional()
  @IsIn(['monthly', 'quarterly', 'one_time'])
  feePeriod?: 'monthly' | 'quarterly' | 'one_time';
}
