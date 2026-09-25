import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MAX_MONEY_MINOR,
  MAX_MONEY_MINOR_MESSAGE,
} from '../../../../common/http/money-bounds';

export class RecordPaymentDto {
  /** Amount received, in paise. Money is always integer minor units. */
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY_MINOR, { message: MAX_MONEY_MINOR_MESSAGE })
  paidMinor!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
