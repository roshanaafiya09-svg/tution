import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateBookingDto {
  @IsUUID()
  tutorSubjectId!: string;

  /**
   * Local wall-clock start (YYYY-MM-DDTHH:mm) in `timezone`, not UTC —
   * same convention as CreateSessionDto's startLocal.
   */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'startLocal must be local wall-clock time, e.g. 2026-08-03T16:00',
  })
  startLocal!: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsInt()
  @Min(15)
  @Max(240)
  durationMin!: number;

  @IsOptional()
  @IsUrl(
    { require_protocol: true },
    { message: 'meetingUrl must be a full URL' },
  )
  meetingUrl?: string;
}
