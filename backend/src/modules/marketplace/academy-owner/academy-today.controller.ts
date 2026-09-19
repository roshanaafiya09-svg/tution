import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { AcademyTodayService } from './academy-today.service';

/** Academy Dashboard -> Today's command center (new feature). Same
 *  guard/role stack as every other academy-owner controller — see
 *  AcademyTodayService's doc comment for the aggregation this backs. */
@Controller('academy/me/today')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('academy')
export class AcademyTodayController {
  constructor(private readonly service: AcademyTodayService) {}

  @Get()
  getToday(@CurrentUser() user: AccessTokenPayload) {
    return this.service.getToday(user.sub);
  }
}
