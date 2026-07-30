import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateAssignmentDto {
  @IsUUID()
  batchId!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  instructions?: string;

  /** Local wall-clock due time in `timezone` — same discipline as sessions. */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'dueAtLocal must be local wall-clock time, e.g. 2026-08-10T23:59',
  })
  dueAtLocal!: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
