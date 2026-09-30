import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { TeachingContextScope } from '../../teaching-context/teaching-context.guard';
import { MaterialsService } from './materials.service';
import { CreateMaterialDto } from './dto/create-material.dto';

// L2: every route here must resolve the caller's teaching context — a
// tutor viewing their Individual profile must never see/touch an Academy
// batch's materials (or the reverse) just because both profiles share the
// same underlying tutor_id. TeachingContextGuard is a no-op for non-tutor
// callers, so applying it controller-wide is safe for the student-facing
// routes too. Class-level like AnnouncementsController/
// OfflineAssessmentsController — JwtAuthGuard must stay class-level too
// (not per-route) so it runs before TeachingContextGuard.
@Controller('materials')
@TeachingContextScope()
@UseGuards(JwtAuthGuard, RolesGuard)
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Post('upload-url')
  @Roles('tutor')
  createUploadUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateMaterialDto,
  ) {
    return this.materialsService.createUploadUrl(user.sub, dto);
  }

  /** Bulk sibling of listForBatch — materials across every batch the
   *  student is enrolled in, in one call. */
  @Get('mine')
  @Roles('student')
  listMine(@CurrentUser() user: AccessTokenPayload) {
    return this.materialsService.listForOwnEnrolledBatches(user.sub);
  }

  @Get('batch/:batchId')
  listForBatch(
    @CurrentUser() user: AccessTokenPayload,
    @Param('batchId') batchId: string,
  ) {
    return this.materialsService.listForBatch(
      user.sub,
      batchId,
      user.roles.includes('tutor'),
    );
  }

  @Get(':id/download-url')
  getDownloadUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.materialsService.getDownloadUrl(
      user.sub,
      id,
      user.roles.includes('tutor'),
    );
  }

  @Delete(':id')
  @Roles('tutor')
  delete(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.materialsService.delete(user.sub, id);
  }
}
