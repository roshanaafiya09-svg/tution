import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { AcademyOwnerLeaveService } from './academy-owner-leave.service';
import {
  ApproveLeaveDto,
  AssignSubstituteDto,
} from '../../holidays/dto/approve-leave.dto';

/** Teacher Leave workflow, academy-admin-facing half (spec §3–5). Sits
 *  next to AcademyOwnerController/AcademyOwnerBatchesController (same
 *  @Roles('academy') class guard, same /academy/me/* prefix). */
@Controller('academy/me/leave-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('academy')
export class AcademyOwnerLeaveController {
  constructor(private readonly service: AcademyOwnerLeaveService) {}

  @Get('pending')
  listPending(@CurrentUser() user: AccessTokenPayload) {
    return this.service.listPending(user.sub);
  }

  @Get()
  listAll(@CurrentUser() user: AccessTokenPayload) {
    return this.service.listAll(user.sub);
  }

  @Get(':id/sessions')
  listSessions(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.service.listSessions(user.sub, id);
  }

  @Post(':id/approve')
  approve(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: ApproveLeaveDto,
  ) {
    return this.service.approve(user.sub, id, dto.substituteTutorId);
  }

  @Post(':id/reject')
  reject(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.service.reject(user.sub, id);
  }

  @Post(':id/substitute')
  assignSubstitute(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: AssignSubstituteDto,
  ) {
    return this.service.assignSubstitute(user.sub, id, dto.substituteTutorId);
  }
}
