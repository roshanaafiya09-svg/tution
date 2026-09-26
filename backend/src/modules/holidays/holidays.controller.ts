import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DateTime } from 'luxon';
import { HolidayService } from './holiday.service';
import { JwtAuthGuard } from '../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../identity/auth/guards/roles.guard';
import { Roles } from '../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../identity/auth/tokens.service';
import { TeachingContextScope } from '../teaching-context/teaching-context.guard';
import { CurrentTeachingContext } from '../teaching-context/current-teaching-context.decorator';
import type { TeachingContext } from '../teaching-context/teaching-context';

const DEFAULT_TIMEZONE = 'Asia/Kolkata';
const DEFAULT_LOOKAHEAD_DAYS = 90;

/**
 * Read-only holiday visibility for teacher/student/parent — deliberately
 * defaults to a 90-day lookahead so an upcoming holiday shows up in the
 * relevant dashboard well before its date (spec §14), not only once
 * cancellation has actually run.
 */
@Controller('holidays')
@TeachingContextScope()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('tutor', 'student', 'parent')
export class HolidaysController {
  constructor(private readonly holidayService: HolidayService) {}

  @Get('me')
  async listMine(
    @CurrentUser() user: AccessTokenPayload,
    @CurrentTeachingContext() ctx: TeachingContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const rangeFrom =
      from ?? DateTime.now().setZone(DEFAULT_TIMEZONE).toISODate()!;
    const rangeTo =
      to ??
      DateTime.fromISO(rangeFrom)
        .plus({ days: DEFAULT_LOOKAHEAD_DAYS })
        .toISODate()!;
    return this.holidayService.listForViewer(user, ctx, rangeFrom, rangeTo);
  }
}
