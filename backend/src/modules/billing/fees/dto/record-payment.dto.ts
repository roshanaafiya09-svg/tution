import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class RecordPaymentDto {
  /** Amount received, in paise. Money is always integer minor units. */
  @IsInt()
  @Min(0)
  paidMinor!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
