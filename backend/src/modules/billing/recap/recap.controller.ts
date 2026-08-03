import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { RecapService } from './recap.service';
import { SUBSCRIPTION_PLANS } from '../subscriptions/plans';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RecapController {
  constructor(private readonly recapService: RecapService) {}

  /** Trial-end value recap (blueprint §5) — the paywall's numbers. */
  @Get('recap')
  @Roles('tutor')
  recap(@CurrentUser() user: AccessTokenPayload) {
    return this.recapService.forTutor(user.sub);
  }

  /** Pricing shown at the paywall — feeds into POST /payments/subscription/order. */
  @Get('plans')
  @Roles('tutor')
  plans() {
    return SUBSCRIPTION_PLANS;
  }
}
