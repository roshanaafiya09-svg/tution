import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MAX_MONEY_MINOR,
  MAX_MONEY_MINOR_MESSAGE,
} from '../../../../common/http/money-bounds';

export class CreateBatchDto {
  @IsString()
  @MaxLength(160)
  title!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  gradeLevelId!: string;

  @IsInt()
  @Min(1)
  capacity!: number;

  @IsInt()
  @Min(0)
  @Max(MAX_MONEY_MINOR, { message: MAX_MONEY_MINOR_MESSAGE })
  feeMinor!: number;

  @IsOptional()
  @IsIn(['monthly', 'quarterly', 'one_time'])
  feePeriod?: 'monthly' | 'quarterly' | 'one_time';
}
