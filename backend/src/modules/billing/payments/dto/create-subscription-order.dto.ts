import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { SUBSCRIPTION_PLANS } from '../../subscriptions/plans';

export class CreateSubscriptionOrderDto {
  @IsIn(Object.keys(SUBSCRIPTION_PLANS))
  planId!: string;

  /** Extra 25-student blocks on top of what the plan includes (audit H1).
   *  The server prices the order and checks it covers current usage; this
   *  is only a request, never a price. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(40)
  extraBlocks?: number;
}
