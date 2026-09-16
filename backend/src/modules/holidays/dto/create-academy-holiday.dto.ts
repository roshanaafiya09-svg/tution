import {
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateAcademyHolidayDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsIn(['academy', 'batches'])
  scope!: 'academy' | 'batches';

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  batchIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
