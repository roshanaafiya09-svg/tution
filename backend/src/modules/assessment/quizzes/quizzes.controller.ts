import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { StudentQuizzesService } from './quizzes.service';
import { SubmitQuizAttemptDto } from './dto/submit-quiz-attempt.dto';

/** Student-facing quiz-taking (Phase 3). Shares the `/quizzes` prefix
 *  with ai/quizzes' tutor-authoring controller but every route here is
 *  a distinct depth-3 path (batch/:id, :id/take, :id/submit, ...), so
 *  none of them collide with that controller's /quizzes/me or
 *  /quizzes/:id routes. */
@Controller('quizzes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudentQuizzesController {
  constructor(private readonly quizzesService: StudentQuizzesService) {}

  @Post(':draftId/publish')
  @Roles('tutor')
  publish(
    @CurrentUser() user: AccessTokenPayload,
    @Param('draftId') draftId: string,
  ) {
    return this.quizzesService.publish(user.sub, draftId);
  }

  /** Bulk sibling of listForBatch — quizzes across every batch the
   *  student is enrolled in, in one call. Kept as a depth-2 path (not a
   *  bare 'mine') per this controller's existing convention of avoiding
   *  single-segment routes, since '/quizzes' is also served by ai/quizzes'
   *  tutor-authoring controller ('me', ':id'). */
  @Get('batches/mine')
  @Roles('student')
  listMine(@CurrentUser() user: AccessTokenPayload) {
    return this.quizzesService.listForOwnEnrolledBatches(user.sub);
  }

  @Get('batch/:batchId')
  @Roles('student')
  listForBatch(
    @CurrentUser() user: AccessTokenPayload,
    @Param('batchId') batchId: string,
  ) {
    return this.quizzesService.listForBatch(user.sub, batchId);
  }

  @Get('attempts/me')
  @Roles('student')
  myAttempts(@CurrentUser() user: AccessTokenPayload) {
    return this.quizzesService.myAttempts(user.sub);
  }

  @Get(':quizId/take')
  @Roles('student')
  getToTake(
    @CurrentUser() user: AccessTokenPayload,
    @Param('quizId') quizId: string,
  ) {
    return this.quizzesService.getToTake(user.sub, quizId);
  }

  @Post(':quizId/submit')
  @Roles('student')
  submit(
    @CurrentUser() user: AccessTokenPayload,
    @Param('quizId') quizId: string,
    @Body() dto: SubmitQuizAttemptDto,
  ) {
    return this.quizzesService.submit(user.sub, quizId, dto.answers);
  }

  @Get(':quizId/attempts')
  @Roles('tutor')
  listAttempts(
    @CurrentUser() user: AccessTokenPayload,
    @Param('quizId') quizId: string,
  ) {
    return this.quizzesService.listAttemptsForQuiz(user.sub, quizId);
  }
}
