import { IsIn } from 'class-validator';
import { SUBSCRIPTION_PLANS } from '../../subscriptions/plans';

export class CreateSubscriptionOrderDto {
  @IsIn(Object.keys(SUBSCRIPTION_PLANS))
  planId!: string;
}
