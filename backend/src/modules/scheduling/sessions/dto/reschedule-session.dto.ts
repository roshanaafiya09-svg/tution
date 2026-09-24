import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class RescheduleSessionDto {
  /** Same local wall-clock convention as CreateSessionDto.startLocal. */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message:
      'newStartLocal must be local wall-clock time, e.g. 2026-08-03T16:00',
  })
  newStartLocal!: string;

  /** Defaults to the session's own stored timezone when omitted. */
  @IsOptional()
  @IsString()
  timezone?: string;

  /** Defaults to the session's current duration when omitted. */
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(600)
  durationMin?: number;
}
