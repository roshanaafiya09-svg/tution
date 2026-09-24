import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { TeachingContextScope } from '../../teaching-context/teaching-context.guard';
import { CurrentTeachingContext } from '../../teaching-context/current-teaching-context.decorator';
import type { TeachingContext } from '../../teaching-context/teaching-context';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { RescheduleSessionDto } from './dto/reschedule-session.dto';

const DEFAULT_WINDOW_DAYS = 14;

function parseWindow(from?: string, to?: string): { from: Date; to: Date } {
  const start = from ? new Date(from) : new Date();
  const end = to
    ? new Date(to)
    : new Date(start.getTime() + DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { from: start, to: end };
}

@Controller('sessions')
@TeachingContextScope()
@UseGuards(JwtAuthGuard, RolesGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  @Roles('tutor')
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateSessionDto,
  ) {
    return this.sessionsService.create(user.sub, dto);
  }

  /** Tutor's upcoming schedule — the web dashboard's home view. */
  @Get('me')
  @Roles('tutor')
  listOwn(
    @CurrentUser() user: AccessTokenPayload,
    @CurrentTeachingContext() ctx: TeachingContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const window = parseWindow(from, to);
    return this.sessionsService.listForTutorBetween(
      user.sub,
      ctx,
      window.from,
      window.to,
    );
  }

  /** Student's "Today" view (blueprint §4). */
  @Get('upcoming')
  @Roles('student')
  listUpcoming(
    @CurrentUser() user: AccessTokenPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const window = parseWindow(from, to);
    return this.sessionsService.listForStudentBetween(
      user.sub,
      window.from,
      window.to,
    );
  }

  /** Parent's view of a consented child's schedule — mirrors
   *  GET /progress/student/:studentId and
   *  GET /attendance/student/:studentId/summary's naming and
   *  consent-check pattern. 403s unless there's an active consent link. */
  @Get('student/:studentId')
  @Roles('parent')
  listForChild(
    @CurrentUser() user: AccessTokenPayload,
    @Param('studentId') studentId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const window = parseWindow(from, to);
    return this.sessionsService.forParent(
      user.sub,
      studentId,
      window.from,
      window.to,
    );
  }

  @Get('batch/:batchId')
  @Roles('tutor')
  listForBatch(
    @CurrentUser() user: AccessTokenPayload,
    @Param('batchId') batchId: string,
  ) {
    return this.sessionsService.listForBatch(user.sub, batchId);
  }

  /** H4 edit — today, only meetingUrl. */
  @Patch(':id')
  @Roles('tutor')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.sessionsService.updateMeetingUrl(user.sub, id, dto);
  }

  @Post(':id/reschedule')
  @Roles('tutor')
  reschedule(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: RescheduleSessionDto,
  ) {
    return this.sessionsService.reschedule(user.sub, id, dto);
  }

  @Post(':id/cancel')
  @Roles('tutor')
  cancel(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Query('series') series?: string,
  ) {
    return this.sessionsService.cancel(user.sub, id, series === 'true');
  }

  @Post(':id/complete')
  @Roles('tutor')
  complete(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.sessionsService.complete(user.sub, id);
  }
}
