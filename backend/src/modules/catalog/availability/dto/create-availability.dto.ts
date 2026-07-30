import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export class CreateAvailabilityDto {
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @IsString()
  @Matches(TIME_PATTERN, { message: 'startTime must be HH:mm (24h)' })
  startTime!: string;

  @IsString()
  @Matches(TIME_PATTERN, { message: 'endTime must be HH:mm (24h)' })
  endTime!: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsString()
  effectiveFrom!: string; // ISO date (YYYY-MM-DD)

  @IsOptional()
  @IsString()
  effectiveTo?: string;
}
