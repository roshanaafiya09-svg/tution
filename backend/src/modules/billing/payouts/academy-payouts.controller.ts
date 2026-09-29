import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { PayoutsService } from './payouts.service';
import { GeneratePayoutDto } from './dto/generate-payout.dto';

/**
 * An academy's payouts: the fees collected online for batches the ACADEMY
 * owns, paid to its owner. The academy is always resolved from the
 * authenticated owner — there is no academy id in any URL or body, so one
 * academy cannot read, generate or complete another's payouts.
 */
@Controller('academy/me/payouts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('academy')
export class AcademyPayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.payoutsService.listForAcademy(user.sub);
  }

  @Post('generate')
  generate(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: GeneratePayoutDto,
  ) {
    return this.payoutsService.generateForAcademy(
      user.sub,
      dto.periodStart,
      dto.periodEnd,
    );
  }

  @Post(':payoutId/simulate-complete')
  simulateComplete(
    @CurrentUser() user: AccessTokenPayload,
    @Param('payoutId', ParseUUIDPipe) payoutId: string,
  ) {
    return this.payoutsService.simulateCompleteForAcademy(user.sub, payoutId);
  }
}
