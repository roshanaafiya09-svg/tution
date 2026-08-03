import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { DoubtSolverService } from './doubt-solver.service';
import { AskDoubtDto } from './dto/ask-doubt.dto';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';

@Controller('doubt-solver')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DoubtSolverController {
  constructor(private readonly doubtSolverService: DoubtSolverService) {}

  @Post('materials/:materialId/index')
  @Roles('tutor')
  indexMaterial(
    @CurrentUser() user: AccessTokenPayload,
    @Param('materialId') materialId: string,
  ) {
    return this.doubtSolverService.indexMaterial(user.sub, materialId);
  }

  @Post('ask')
  @Roles('student')
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
