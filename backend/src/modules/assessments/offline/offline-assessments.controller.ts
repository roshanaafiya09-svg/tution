import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { TeachingContextScope } from '../../teaching-context/teaching-context.guard';
import { CurrentTeachingContext } from '../../teaching-context/current-teaching-context.decorator';
import type { TeachingContext } from '../../teaching-context/teaching-context';
import { OfflineAssessmentsService } from './offline-assessments.service';
import { CreateOfflineAssessmentDto } from '../dto/create-offline-assessment.dto';
import { QuestionPaperUploadUrlDto } from '../dto/question-paper-upload-url.dto';
import { ScorecardUploadUrlDto } from '../dto/scorecard-upload-url.dto';
import { ProcessScorecardDto } from '../dto/process-scorecard.dto';

const SCORECARD_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Controller('assessments/offline')
@TeachingContextScope()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('tutor')
export class OfflineAssessmentsController {
  constructor(private readonly service: OfflineAssessmentsService) {}

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateOfflineAssessmentDto,
  ) {
    return this.service.create(user.sub, dto);
  }

  @Get('me')
  listMine(
    @CurrentUser() user: AccessTokenPayload,
    @CurrentTeachingContext() ctx: TeachingContext,
  ) {
    return this.service.listForTutor(user.sub, ctx);
  }

  @Get(':id')
  getOwn(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.getOwn(user.sub, id);
  }

  @Post(':id/question-paper/upload-url')
  createQuestionPaperUploadUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QuestionPaperUploadUrlDto,
  ) {
    return this.service.createQuestionPaperUploadUrl(
      user.sub,
      id,
      dto.mime,
      dto.sizeBytes,
    );
  }

  @Get(':id/question-paper/download-url')
  getQuestionPaperDownloadUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.getQuestionPaperDownloadUrl(user.sub, id);
  }

  @Post(':id/schedule')
  schedule(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.schedule(user.sub, id);
  }

  @Get(':id/scorecard-template')
  async downloadTemplate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() reply: FastifyReply,
  ) {
    const { buffer, filename } = await this.service.downloadScorecardTemplate(
      user.sub,
      id,
    );
    reply
      .header('Content-Type', SCORECARD_MIME)
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(buffer);
  }

  @Post(':id/scorecard/upload-url')
  createScorecardUploadUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScorecardUploadUrlDto,
  ) {
    return this.service.createScorecardUploadUrl(user.sub, id, dto.sizeBytes);
  }

  @Post(':id/scorecard/process')
  processScorecard(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProcessScorecardDto,
  ) {
    return this.service.processScorecard(user.sub, id, dto.objectKey);
  }

  @Get(':id/scorecard-imports')
  listScorecardImports(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.listScorecardImports(user.sub, id);
  }
}
