import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { DoubtSolverService } from './doubt-solver.service';
import { AskDoubtDto } from './dto/ask-doubt.dto';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';
import { ParentPremiumForStudentGuard } from '../../billing/parent-premium/guards/parent-premium-for-student.guard';

@Controller('doubt-solver')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DoubtSolverController {
  constructor(private readonly doubtSolverService: DoubtSolverService) {}

  // Embedding a material also hits the AI provider — capped separately
  // from ask() below since a tutor legitimately indexing a batch of
  // materials in one sitting needs more headroom than a single student
  // asking one question at a time.
  @Post('materials/:materialId/index')
  @Roles('tutor')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  indexMaterial(
    @CurrentUser() user: AccessTokenPayload,
    @Param('materialId') materialId: string,
  ) {
    return this.doubtSolverService.indexMaterial(user.sub, materialId);
  }

  /** Parent Premium-gated (blueprint §5/§10 Phase 3) — entirely new in
   *  Phase 3, unlike the tutor's ActiveSubscriptionGuard there's no free
   *  tier underneath. submitAttempt/myHistory below stay ungated: they
   *  only continue or read an interaction an already-gated ask() created. */
  // Each call hits the AI provider (RAG + Socratic gate) — a real
  // external cost per request the global 300/min-per-IP net doesn't
  // account for. Generous enough for a genuine back-and-forth study
  // session, tight enough to block a scripted budget-draining loop.
  @Post('ask')
  @Roles('student')
  @UseGuards(ParentPremiumForStudentGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  ask(@CurrentUser() user: AccessTokenPayload, @Body() dto: AskDoubtDto) {
    return this.doubtSolverService.ask(user.sub, dto.batchId, dto.question);
  }

  @Post(':hintId/attempt')
  @Roles('student')
  submitAttempt(
    @CurrentUser() user: AccessTokenPayload,
    @Param('hintId') hintId: string,
    @Body() dto: SubmitAttemptDto,
  ) {
    return this.doubtSolverService.submitAttempt(
      user.sub,
      hintId,
      dto.attemptText,
    );
  }

  @Get('batch/:batchId/history')
  @Roles('student')
  myHistory(
    @CurrentUser() user: AccessTokenPayload,
    @Param('batchId') batchId: string,
  ) {
    return this.doubtSolverService.myHistory(user.sub, batchId);
  }
}
