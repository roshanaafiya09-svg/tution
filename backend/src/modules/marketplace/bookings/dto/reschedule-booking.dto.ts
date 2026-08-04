import { IsOptional, IsString, Matches } from 'class-validator';

export class RescheduleBookingDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'startLocal must be local wall-clock time, e.g. 2026-08-03T16:00',
  })
  startLocal!: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
