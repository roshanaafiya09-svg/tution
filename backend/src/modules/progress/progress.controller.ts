import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../identity/auth/guards/roles.guard';
import { Roles } from '../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../identity/auth/tokens.service';
import { ProgressService } from './progress.service';

@Controller('progress')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  /** Student's own trend view, across every batch they're enrolled in. */
  @Get('me')
  @Roles('student')
  me(@CurrentUser() user: AccessTokenPayload, @Query('weeks') weeks?: string) {
    return this.progressService.forStudent(user.sub, parseWeeks(weeks));
  }

  /** Parent's view of a consented child's trend — blueprint §3 "attendance
   *  and results view". 403s unless there's an active consent link. */
  @Get('student/:studentId')
  @Roles('parent')
  forStudent(
    @CurrentUser() user: AccessTokenPayload,
    @Param('studentId') studentId: string,
    @Query('weeks') weeks?: string,
  ) {
    return this.progressService.forParent(
      user.sub,
      studentId,
      parseWeeks(weeks),
    );
  }
}

function parseWeeks(weeks: string | undefined): number | undefined {
  if (!weeks) return undefined;
  const parsed = Number(weeks);
  return Number.isFinite(parsed) ? parsed : undefined;
}
