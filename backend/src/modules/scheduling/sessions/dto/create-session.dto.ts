import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateSessionDto {
  @IsUUID()
  batchId!: string;

  /**
   * Local wall-clock start (YYYY-MM-DDTHH:mm) in `timezone`, not UTC —
   * a tutor schedules "4pm Monday", and that must survive DST. The
   * server converts to UTC per occurrence (see recurrence.ts).
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
  @Min(5)
  @Max(600)
  durationMin!: number;

  @IsOptional()
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'meetingUrl must be a full http(s) URL' },
  )
  meetingUrl?: string;

  /** RRULE string, e.g. "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=12". */
  @IsOptional()
  @IsString()
  recurrenceRule?: string;
}
