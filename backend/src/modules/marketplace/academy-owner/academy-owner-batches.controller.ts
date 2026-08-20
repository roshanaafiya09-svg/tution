import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { AcademyOwnerBatchesService } from './academy-owner-batches.service';
import { CreateBatchDto } from '../../scheduling/batches/dto/create-batch.dto';
import { UpdateBatchDto } from '../../scheduling/batches/dto/update-batch.dto';
import { CreateSessionDto } from '../../scheduling/sessions/dto/create-session.dto';
import { CreateInviteDto } from '../../scheduling/invites/dto/create-invite.dto';

class CreateAcademyBatchDto extends CreateBatchDto {
  @IsUUID()
  tutorId!: string;
}

/**
 * Academy-scoped batch/session/invite management — see
 * AcademyOwnerBatchesService's doc comment for why this delegates to the
 * existing tutor-facing services instead of a new ownership model. Sits
 * next to AcademyOwnerController (same @Roles('academy') class guard,
 * same /academy/me/* prefix) but in its own controller/service pair so
 * neither file grows unreasonably large.
 */
@Controller('academy/me/batches')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('academy')
export class AcademyOwnerBatchesController {
  constructor(private readonly service: AcademyOwnerBatchesService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.service.listBatches(user.sub);
  }

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateAcademyBatchDto,
  ) {
    const { tutorId, ...batchDto } = dto;
    return this.service.createBatch(user.sub, tutorId, batchDto);
  }

  @Get(':id')
  get(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.service.getBatch(user.sub, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdateBatchDto,
  ) {
    return this.service.updateBatch(user.sub, id, dto);
  }

  @Post(':id/archive')
  archive(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.service.archiveBatch(user.sub, id);
  }

  @Get(':id/students')
  listStudents(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.service.listStudents(user.sub, id);
  }

  @Delete(':id/students/:studentId')
  removeStudent(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('studentId') studentId: string,
  ) {
    return this.service.removeStudent(user.sub, id, studentId);
  }

  @Get(':id/sessions')
  listSessions(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.service.listSessions(user.sub, id);
  }

  @Post(':id/sessions')
  createSession(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: CreateSessionDto,
  ) {
    return this.service.createSession(user.sub, { ...dto, batchId: id });
  }

  @Post(':id/sessions/:sessionId/cancel')
  cancelSession(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @Query('series') series?: string,
  ) {
    return this.service.cancelSession(
      user.sub,
      id,
      sessionId,
      series === 'true',
    );
  }

  @Get(':id/invites')
  listInvites(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.service.listInvites(user.sub, id);
  }

  @Post(':id/invites')
  createInvite(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: CreateInviteDto,
  ) {
    return this.service.createInvite(user.sub, id, dto);
  }
}
