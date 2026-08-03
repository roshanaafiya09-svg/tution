import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { PayoutsService } from './payouts.service';
import { GeneratePayoutDto } from './dto/generate-payout.dto';

@Controller('payouts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('tutor')
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get('me')
  listMine(@CurrentUser() user: AccessTokenPayload) {
    return this.payoutsService.listForTutor(user.sub);
  }

  @Post('generate')
  generate(@CurrentUser() user: AccessTokenPayload, @Body() dto: GeneratePayoutDto) {
    return this.payoutsService.generate(user.sub, dto.periodStart, dto.periodEnd);
  }

  /** Dev/test-only — see PayoutsProvider.simulateComplete. */
  @Post(':payoutId/simulate-complete')
  simulateComplete(
    @CurrentUser() user: AccessTokenPayload,
    @Param('payoutId') payoutId: string,
  ) {
    return this.payoutsService.simulateComplete(user.sub, payoutId);
  }
}
