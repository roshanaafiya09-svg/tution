import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { AcademyOwnerParentsService } from './academy-owner-parents.service';

/** Academy Dashboard -> Main -> Parents (new feature). Same guard/role
 *  stack as every other academy-owner controller — ownership is always
 *  resolved server-side from the caller's JWT, never from a client-
 *  supplied academy id. */
@Controller('academy/me/parents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('academy')
export class AcademyOwnerParentsController {
  constructor(private readonly service: AcademyOwnerParentsService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.service.listParentsAcrossAcademy(user.sub);
  }

  @Get(':id')
  detail(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.service.getParentDetail(user.sub, id);
  }
}
