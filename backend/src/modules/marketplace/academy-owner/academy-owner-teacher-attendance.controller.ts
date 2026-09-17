import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { AcademyOwnerTeacherAttendanceService } from './academy-owner-teacher-attendance.service';
import { MarkTeacherAttendanceDto } from './dto/mark-teacher-attendance.dto';

/** Academy Dashboard -> Academic -> Attendance -> Teacher (new feature),
 *  deliberately separate from AcademyOwnerAttendanceController (Student).
 *  Same guard/role stack as every other academy-owner controller. */
@Controller('academy/me/attendance/teachers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('academy')
export class AcademyOwnerTeacherAttendanceController {
  constructor(private readonly service: AcademyOwnerTeacherAttendanceService) {}

  @Get('today')
  today(@CurrentUser() user: AccessTokenPayload) {
    return this.service.getTodaySummary(user.sub);
  }

  @Get()
  table(
    @CurrentUser() user: AccessTokenPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('teacherId') teacherId?: string,
    @Query('status') status?: string,
    @Query('batchId') batchId?: string,
  ) {
    return this.service.listAttendanceTable(user.sub, {
      from,
      to,
      teacherId,
      status,
      batchId,
    });
  }

  @Get(':teacherId')
  detail(
    @CurrentUser() user: AccessTokenPayload,
    @Param('teacherId') teacherId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.getTeacherAttendance(user.sub, teacherId, { from, to });
  }

  @Post()
  mark(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: MarkTeacherAttendanceDto,
  ) {
    return this.service.markAttendance(user.sub, dto);
  }
}
