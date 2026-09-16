import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { AcademyOwnerReportsService } from './academy-owner-reports.service';

/** Academy Dashboard -> Reports. Same guard/role stack and query-param
 *  filter style (plain optional strings, defaults computed server-side)
 *  as AcademyOwnerAttendanceController. */
@Controller('academy/me/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('academy')
export class AcademyOwnerReportsController {
  constructor(private readonly service: AcademyOwnerReportsService) {}

  @Get('summary')
  summary(@CurrentUser() user: AccessTokenPayload) {
    return this.service.summary(user.sub);
  }

  @Get('students')
  students(
    @CurrentUser() user: AccessTokenPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('batchId') batchId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('studentId') studentId?: string,
  ) {
    return this.service.students(user.sub, {
      from,
      to,
      batchId,
      teacherId,
      studentId,
    });
  }

  @Get('teachers')
  teachers(
    @CurrentUser() user: AccessTokenPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('teacherId') teacherId?: string,
  ) {
    return this.service.teachers(user.sub, { from, to, teacherId });
  }

  @Get('batches')
  batches(
    @CurrentUser() user: AccessTokenPayload,
    @Query('teacherId') teacherId?: string,
  ) {
    return this.service.batches(user.sub, { teacherId });
  }

  @Get('attendance')
  attendance(
    @CurrentUser() user: AccessTokenPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('batchId') batchId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('studentId') studentId?: string,
  ) {
    return this.service.attendance(user.sub, {
      from,
      to,
      batchId,
      teacherId,
      studentId,
    });
  }

  @Get('sessions')
  sessions(
    @CurrentUser() user: AccessTokenPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('batchId') batchId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.sessions(user.sub, {
      from,
      to,
      batchId,
      teacherId,
      status,
    });
  }

  @Get('leave')
  leave(
    @CurrentUser() user: AccessTokenPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('teacherId') teacherId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.leave(user.sub, { from, to, teacherId, status });
  }

  @Get('holidays')
  holidays(
    @CurrentUser() user: AccessTokenPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.holidays(user.sub, { from, to });
  }

  @Get('contact-requests')
  contactRequests(
    @CurrentUser() user: AccessTokenPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.contactRequests(user.sub, { from, to });
  }
}
