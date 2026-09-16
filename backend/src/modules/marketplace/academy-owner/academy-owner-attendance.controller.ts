import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { AcademyOwnerAttendanceService } from './academy-owner-attendance.service';

/** Academy Dashboard -> Academic -> Attendance (new feature). Same
 *  guard/role stack as every other academy-owner controller. */
@Controller('academy/me/attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('academy')
export class AcademyOwnerAttendanceController {
  constructor(private readonly service: AcademyOwnerAttendanceService) {}

  @Get('today')
  today(@CurrentUser() user: AccessTokenPayload) {
    return this.service.getTodaySummary(user.sub);
  }

  @Get()
  table(
    @CurrentUser() user: AccessTokenPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('batchId') batchId?: string,
    @Query('tutorId') tutorId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listAttendanceTable(user.sub, {
      from,
      to,
      batchId,
      tutorId,
      status,
    });
  }

  @Get('student/:studentId')
  student(
    @CurrentUser() user: AccessTokenPayload,
    @Param('studentId') studentId: string,
  ) {
    return this.service.getStudentAttendance(user.sub, studentId);
  }

  @Get('batch/:batchId')
  batch(
    @CurrentUser() user: AccessTokenPayload,
    @Param('batchId') batchId: string,
  ) {
    return this.service.getBatchAttendance(user.sub, batchId);
  }
}
