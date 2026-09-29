import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { RecapService } from './recap.service';
import {
  SUBSCRIPTION_PLANS,
  isPlanId,
  planBlocks,
  planCadence,
} from '../subscriptions/plans';
import { SubscriptionCapacityService } from '../subscriptions/subscription-capacity.service';
import { EXTRA_BLOCK_PRICE_MINOR } from '../subscriptions/blocks';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RecapController {
  constructor(
    private readonly recapService: RecapService,
    private readonly capacity: SubscriptionCapacityService,
  ) {}

  /** Trial-end value recap (blueprint §5) — the paywall's numbers. */
  @Get('recap')
  @Roles('tutor')
  recap(@CurrentUser() user: AccessTokenPayload) {
    return this.recapService.forTutor(user.sub);
  }

  /** Pricing shown at the paywall — feeds into POST /payments/subscription/order. */
  /** The plan catalogue. Each plan now also says how many 25-student blocks
   *  it includes (audit H1); the original fields are unchanged. */
  @Get('plans')
  @Roles('tutor')
  plans() {
    return Object.fromEntries(
      Object.entries(SUBSCRIPTION_PLANS).map(([id, plan]) => [
        id,
        {
          ...plan,
          blocks: isPlanId(id) ? planBlocks(id) : 0,
          cadence: isPlanId(id) ? planCadence(id) : 'monthly',
        },
      ]),
    );
  }

  /** The teacher's OWN (individual) subscription state and student capacity,
   *  computed by the server from real enrollments — the UI only displays it.
   *  Includes the next-period quote sized from current usage. */
  @Get('capacity')
  @Roles('tutor')
  async capacityFor(@CurrentUser() user: AccessTokenPayload) {
    const usage = await this.capacity.getUsage({
      kind: 'tutor',
      tutorId: user.sub,
    });
    return { ...usage, extraBlockPriceMinor: EXTRA_BLOCK_PRICE_MINOR };
  }
}
