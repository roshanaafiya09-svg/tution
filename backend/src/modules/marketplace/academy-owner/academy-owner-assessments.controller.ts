import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { AcademyOwnerAssessmentsService } from './academy-owner-assessments.service';

/** Academy Dashboard -> Assessment -> Weekly Compliance (spec §20/§21/§37).
 *  Same guard/role stack as every other academy-owner controller. */
@Controller('academy/me/assessments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('academy')
export class AcademyOwnerAssessmentsController {
  constructor(private readonly service: AcademyOwnerAssessmentsService) {}

  @Get('weekly-compliance')
  weeklyCompliance(
    @CurrentUser() user: AccessTokenPayload,
    @Query('weekStartDate') weekStartDate?: string,
  ) {
    return this.service.getWeeklyCompliance(user.sub, weekStartDate);
  }

  @Get(':id')
  detail(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.service.getAssessmentDetail(user.sub, id);
  }

  @Get(':id/question-paper')
  questionPaper(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.service.getQuestionPaperDownloadUrl(user.sub, id);
  }
}
