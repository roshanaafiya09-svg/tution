import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { InvitesService } from './invites.service';
import { CreateInviteDto } from './dto/create-invite.dto';

@Controller('invites')
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Post('batch/:batchId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tutor')
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Param('batchId') batchId: string,
    @Body() dto: CreateInviteDto,
  ) {
    return this.invitesService.create(user.sub, batchId, dto);
  }

  @Get('batch/:batchId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tutor')
  listForBatch(
    @CurrentUser() user: AccessTokenPayload,
    @Param('batchId') batchId: string,
  ) {
    return this.invitesService.listForBatch(user.sub, batchId);
  }

  /** Public: lets the invite landing page show what's being joined. */
  @Get(':token')
  preview(@Param('token') token: string) {
    return this.invitesService.preview(token);
  }

  @Post(':token/redeem')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  redeem(
    @CurrentUser() user: AccessTokenPayload,
    @Param('token') token: string,
  ) {
    return this.invitesService.redeem(token, user.sub);
  }
}
