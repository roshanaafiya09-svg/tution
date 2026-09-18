import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { OnlineAssessmentsService } from './online-assessments.service';
import { CreateOnlineAssessmentDto } from '../dto/create-online-assessment.dto';
import { GenerateAssessmentQuestionsDto } from '../dto/generate-assessment-questions.dto';
import { UpdateAssessmentQuestionDto } from '../dto/update-assessment-question.dto';
import { SubmitAssessmentAttemptDto } from '../dto/submit-assessment-attempt.dto';

@Controller('assessments/online')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OnlineAssessmentsController {
  constructor(private readonly service: OnlineAssessmentsService) {}

  @Post()
  @Roles('tutor')
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateOnlineAssessmentDto,
  ) {
    return this.service.create(user.sub, dto);
  }

  @Get('me')
  @Roles('tutor')
  listMine(@CurrentUser() user: AccessTokenPayload) {
    return this.service.listForTutor(user.sub);
  }

  @Get('student/me')
  @Roles('student')
  listForStudent(@CurrentUser() user: AccessTokenPayload) {
    return this.service.listForStudent(user.sub);
  }

  @Get(':id')
  @Roles('tutor')
  getOwn(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.service.getWithQuestions(user.sub, id);
  }

  @Post(':id/generate')
  @Roles('tutor')
  generate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: GenerateAssessmentQuestionsDto,
  ) {
    return this.service.generateQuestions(
      user.sub,
      id,
      dto.materialId,
      dto.count,
    );
  }

  @Patch(':id/questions/:questionId')
  @Roles('tutor')
  updateQuestion(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() dto: UpdateAssessmentQuestionDto,
  ) {
    return this.service.updateQuestion(user.sub, id, questionId, dto);
  }

  @Post(':id/publish')
  @Roles('tutor')
  publish(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.service.publish(user.sub, id);
  }

  @Get(':id/results')
  @Roles('tutor')
  listResults(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.service.listResults(user.sub, id);
  }

  @Get(':id/take')
  @Roles('student')
  take(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.service.getToTake(user.sub, id);
  }

  @Post(':id/submit')
  @Roles('student')
  submit(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: SubmitAssessmentAttemptDto,
  ) {
    return this.service.submit(user.sub, id, dto.answers);
  }
}
