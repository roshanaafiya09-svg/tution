import {
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateLeaveRequestDto {
  @IsUUID()
  academyId!: string;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsIn(['full_day', 'specific_classes'])
  leaveType!: 'full_day' | 'specific_classes';

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  sessionIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
