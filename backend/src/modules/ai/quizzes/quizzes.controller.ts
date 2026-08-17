import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { QuizzesService } from './quizzes.service';
import { GenerateQuizDto } from './dto/generate-quiz.dto';
import { UpdateQuizQuestionDto } from './dto/update-quiz-question.dto';

@Controller('quizzes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('tutor')
export class QuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  // Each call hits the AI provider to generate a full question set — a
  // real external cost per request the global 300/min-per-IP net
  // doesn't account for.
  @Post('material/:materialId/generate')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  generate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('materialId') materialId: string,
    @Body() dto: GenerateQuizDto,
  ) {
    return this.quizzesService.generate(user.sub, materialId, dto.count);
  }

  @Get('me')
  listMine(@CurrentUser() user: AccessTokenPayload) {
    return this.quizzesService.listForTutor(user.sub);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.quizzesService.getWithQuestions(user.sub, id);
  }

  @Patch(':id/questions/:questionId')
  updateQuestion(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() dto: UpdateQuizQuestionDto,
  ) {
    return this.quizzesService.updateQuestion(user.sub, id, questionId, dto);
  }

  @Post(':id/approve')
  approve(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.quizzesService.approve(user.sub, id);
  }

  @Post(':id/reject')
  reject(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.quizzesService.reject(user.sub, id);
  }
}
