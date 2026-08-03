import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../identity/auth/guards/roles.guard';
import { Roles } from '../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../identity/auth/tokens.service';
import { ParentLinksService } from './parent-links.service';
import { RedeemInviteDto } from './dto/redeem-invite.dto';
import { GrantConsentDto } from './dto/grant-consent.dto';

@Controller('parent-links')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ParentLinksController {
  constructor(private readonly service: ParentLinksService) {}

  @Post('invite')
  @Roles('student')
  createInvite(@CurrentUser() user: AccessTokenPayload) {
    return this.service.createInvite(user.sub);
  }

  @Post('redeem')
  @Roles('parent')
  redeem(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: RedeemInviteDto,
  ) {
    return this.service.redeemInvite(user.sub, dto.token);
  }

  @Post(':id/consent')
  @Roles('parent')
  grantConsent(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: GrantConsentDto,
    @Req() request: FastifyRequest,
  ) {
    const userAgent: string | undefined = request.headers['user-agent'];
    return this.service.grantConsent(
      user.sub,
      id,
      dto.policyVersion,
      request.ip ?? null,
      userAgent ?? null,
    );
  }

  @Get('me')
  @Roles('parent')
  listOwn(@CurrentUser() user: AccessTokenPayload) {
    return this.service.listForParent(user.sub);
  }

  @Get('my-parents')
  @Roles('student')
  listMyParents(@CurrentUser() user: AccessTokenPayload) {
    return this.service.listForStudent(user.sub);
  }
}
