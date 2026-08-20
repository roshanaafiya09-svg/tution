import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { ActiveSubscriptionGuard } from '../../billing/subscriptions/guards/active-subscription.guard';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { BatchesService } from './batches.service';
import { CreateBatchDto } from './dto/create-batch.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';

@Controller('batches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  @Get('me')
  @Roles('tutor')
  listOwn(@CurrentUser() user: AccessTokenPayload) {
    return this.batchesService.listForTutor(user.sub);
  }

  @Get('enrolled')
  @Roles('student')
  listEnrolled(@CurrentUser() user: AccessTokenPayload) {
    return this.batchesService.listForStudent(user.sub);
  }

  /** Open batches with live seats remaining — backs the "Available
   *  batches" section on the Teacher Profile page. */
  @Get('me/open')
  @Roles('tutor')
  listOwnOpen(@CurrentUser() user: AccessTokenPayload) {
    return this.batchesService.listOpenWithSeats(user.sub);
  }

  @Post()
  @Roles('tutor')
  @UseGuards(ActiveSubscriptionGuard)
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateBatchDto) {
    return this.batchesService.create(user.sub, dto);
  }

  @Get(':id')
  @Roles('tutor')
  get(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.batchesService.getOwnedBatch(user.sub, id);
  }

  @Post(':id/archive')
  @Roles('tutor')
  archive(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.batchesService.archive(user.sub, id);
  }

  @Patch(':id')
  @Roles('tutor')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdateBatchDto,
  ) {
    return this.batchesService.update(user.sub, id, dto);
  }

  @Get(':id/students')
  @Roles('tutor')
  listStudents(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.batchesService.listEnrollments(user.sub, id);
  }

  @Delete(':id/students/:studentId')
  @Roles('tutor')
  removeStudent(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('studentId') studentId: string,
  ) {
    return this.batchesService.removeStudent(user.sub, id, studentId);
  }
}
