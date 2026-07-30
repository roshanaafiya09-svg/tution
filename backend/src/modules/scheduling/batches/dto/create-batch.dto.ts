import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

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
  feeMinor!: number;

  @IsOptional()
  @IsIn(['monthly', 'quarterly', 'one_time'])
  feePeriod?: 'monthly' | 'quarterly' | 'one_time';
}
