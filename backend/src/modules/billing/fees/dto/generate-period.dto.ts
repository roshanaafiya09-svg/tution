import { IsOptional, IsInt, IsString, Matches, Min } from 'class-validator';

export class GeneratePeriodDto {
  /** Billing period, e.g. "2026-08". Free-form label, not a date. */
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'periodLabel must be YYYY-MM',
  })
  periodLabel!: string;

  /** Defaults to the batch's own fee when omitted. */
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedMinor?: number;
}
