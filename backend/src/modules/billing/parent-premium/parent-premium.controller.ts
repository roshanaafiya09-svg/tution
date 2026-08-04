import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { ParentPremiumService } from './parent-premium.service';
import { PARENT_PREMIUM_PLANS } from './plans';

@Controller('parent-premium')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ParentPremiumController {
  constructor(private readonly parentPremiumService: ParentPremiumService) {}

  @Get('me')
  @Roles('parent')
  me(@CurrentUser() user: AccessTokenPayload) {
    return this.parentPremiumService.getStatus(user.sub);
  }

  /** Pricing shown at the web checkout — feeds into
   *  POST /payments/parent-premium/order. */
  @Get('plans')
  @Roles('parent')
  plans() {
    return PARENT_PREMIUM_PLANS;
  }
}
