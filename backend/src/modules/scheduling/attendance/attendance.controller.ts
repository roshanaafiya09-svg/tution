import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('session/:sessionId')
  @Roles('tutor')
  listForSession(
    @CurrentUser() user: AccessTokenPayload,
    @Param('sessionId') sessionId: string,
  ) {
    return this.attendanceService.listForSession(user.sub, sessionId);
  }

  @Post('session/:sessionId/mark')
  @Roles('tutor')
  mark(
    @CurrentUser() user: AccessTokenPayload,
    @Param('sessionId') sessionId: string,
    @Body() dto: MarkAttendanceDto,
  ) {
    return this.attendanceService.markManually(
      user.sub,
      sessionId,
      dto.studentId,
      dto.status,
    );
  }

  /** The join-tap that drives the pilot's verdict metric. */
  @Post('session/:sessionId/join')
  @Roles('student')
  join(
    @CurrentUser() user: AccessTokenPayload,
    @Param('sessionId') sessionId: string,
  ) {
    return this.attendanceService.joinSession(user.sub, sessionId);
  }

  @Get('summary/batch/:batchId')
  @Roles('student')
  summary(
    @CurrentUser() user: AccessTokenPayload,
    @Param('batchId') batchId: string,
  ) {
    return this.attendanceService.summaryForStudent(user.sub, batchId);
  }
}
