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

@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Post('upload-url')
  @TeachingContextScope()
  @UseGuards(JwtAuthGuard, RolesGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  listMine(@CurrentUser() user: AccessTokenPayload) {
    return this.materialsService.listForOwnEnrolledBatches(user.sub);
  }

  @Get('batch/:batchId')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tutor')
  delete(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.materialsService.delete(user.sub, id);
  }
}
