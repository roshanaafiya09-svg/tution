import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../identity/auth/guards/roles.guard';
import { Roles } from '../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../identity/auth/tokens.service';
import { AssessmentService } from './assessment.service';
import { CreateAssignmentDto } from './assignments/dto/create-assignment.dto';
import { SubmitAssignmentDto } from './submissions/dto/submit-assignment.dto';
import { GradeSubmissionDto } from './submissions/dto/grade-submission.dto';

@Controller('assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssessmentController {
  constructor(private readonly assessmentService: AssessmentService) {}

  @Post()
  @Roles('tutor')
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.assessmentService.createAssignment(user.sub, dto);
  }

  @Get('batch/:batchId')
  @Roles('tutor')
  listForBatch(
    @CurrentUser() user: AccessTokenPayload,
    @Param('batchId') batchId: string,
  ) {
    return this.assessmentService.listForBatch(user.sub, batchId);
  }

  /** Student's homework list across all their batches. */
  @Get('me')
  @Roles('student')
  listForStudent(@CurrentUser() user: AccessTokenPayload) {
    return this.assessmentService.listForStudent(user.sub);
  }

  @Delete(':id')
  @Roles('tutor')
  delete(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.assessmentService.deleteAssignment(user.sub, id);
  }

  @Post(':id/upload-url')
  @Roles('student')
  createUploadUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') assignmentId: string,
    @Body('mime') mime: string,
  ) {
    return this.assessmentService.createSubmissionUploadUrl(
      user.sub,
      assignmentId,
      mime,
    );
  }

  @Post(':id/submit')
  @Roles('student')
  submit(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') assignmentId: string,
    @Body() dto: SubmitAssignmentDto,
  ) {
    return this.assessmentService.submit(
      user.sub,
      assignmentId,
      dto.objectKeys,
    );
  }

  @Get(':id/submissions')
  @Roles('tutor')
  listSubmissions(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') assignmentId: string,
  ) {
    return this.assessmentService.listSubmissions(user.sub, assignmentId);
  }

  @Get(':id/my-submission')
  @Roles('student')
  getOwnSubmission(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') assignmentId: string,
  ) {
    return this.assessmentService.getOwnSubmission(user.sub, assignmentId);
  }

  @Post('submissions/:submissionId/grade')
  @Roles('tutor')
  grade(
    @CurrentUser() user: AccessTokenPayload,
    @Param('submissionId') submissionId: string,
    @Body() dto: GradeSubmissionDto,
  ) {
    return this.assessmentService.grade(
      user.sub,
      submissionId,
      dto.grade,
      dto.feedback ?? null,
    );
  }

  @Get('summary/batch/:batchId')
  @Roles('student')
  summary(
    @CurrentUser() user: AccessTokenPayload,
    @Param('batchId') batchId: string,
  ) {
    return this.assessmentService.submissionSummary(user.sub, batchId);
  }
}
