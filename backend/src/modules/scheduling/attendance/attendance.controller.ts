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

  /** Tutor's attendance history across every session in a batch they own. */
  @Get('batch/:batchId/history')
  @Roles('tutor')
  batchHistory(
    @CurrentUser() user: AccessTokenPayload,
    @Param('batchId') batchId: string,
  ) {
    return this.attendanceService.historyForBatch(user.sub, batchId);
  }

  /** Student's own all-time attendance summary, across every batch. */
  @Get('me/summary')
  @Roles('student')
  mySummary(@CurrentUser() user: AccessTokenPayload) {
    return this.attendanceService.mySummary(user.sub);
  }

  /** Student's own attendance history, across every batch. */
  @Get('me/history')
  @Roles('student')
  myHistory(@CurrentUser() user: AccessTokenPayload) {
    return this.attendanceService.myHistory(user.sub);
  }

  /** Parent's view of a linked child's attendance summary — mirrors
   *  GET /progress/student/:studentId's naming and consent-check pattern. */
  @Get('student/:studentId/summary')
  @Roles('parent')
  summaryForChild(
    @CurrentUser() user: AccessTokenPayload,
    @Param('studentId') studentId: string,
  ) {
    return this.attendanceService.summaryForParent(user.sub, studentId);
  }

  @Get('student/:studentId/history')
  @Roles('parent')
  historyForChild(
    @CurrentUser() user: AccessTokenPayload,
    @Param('studentId') studentId: string,
  ) {
    return this.attendanceService.historyForParent(user.sub, studentId);
  }
}
