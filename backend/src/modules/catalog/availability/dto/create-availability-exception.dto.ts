import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export class CreateAvailabilityExceptionDto {
  @IsString()
  date!: string; // ISO date (YYYY-MM-DD)

  @IsBoolean()
  isAvailable!: boolean;

  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN, { message: 'startTime must be HH:mm (24h)' })
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN, { message: 'endTime must be HH:mm (24h)' })
  endTime?: string;
}
