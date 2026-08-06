import { IsIn } from 'class-validator';
import { PARENT_PREMIUM_PLANS } from '../../parent-premium/plans';

export class CreateParentPremiumOrderDto {
  @IsIn(Object.keys(PARENT_PREMIUM_PLANS))
  planId!: string;
}
