import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { TeacherLeaveService } from './teacher-leave.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { JwtAuthGuard } from '../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../identity/auth/guards/roles.guard';
import { Roles } from '../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../identity/auth/tokens.service';

/** Teacher Leave workflow, teacher-facing half (spec §2). Approval lives
 *  in AcademyOwnerLeaveController — a teacher can only ever create,
 *  view, and withdraw their own requests here. */
@Controller('leave')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('tutor')
export class TeacherLeaveController {
  constructor(private readonly service: TeacherLeaveService) {}

  @Get('academies')
  listAcademies(@CurrentUser() user: AccessTokenPayload) {
    return this.service.listAcademiesForTutor(user.sub);
  }

  @Get('me')
  listMine(@CurrentUser() user: AccessTokenPayload) {
    return this.service.listForTutor(user.sub);
  }

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateLeaveRequestDto,
  ) {
    return this.service.create(user.sub, dto);
  }

  @Get(':id/sessions')
  async listSessions(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    await this.service.getOwnedForTutor(user.sub, id);
    return this.service.listSessionsForRequest(id);
  }

  @Post(':id/withdraw')
  withdraw(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.service.withdraw(user.sub, id);
  }
}
