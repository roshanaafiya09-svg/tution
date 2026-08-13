import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { MaterialsService } from './materials.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { LocalStorageProvider } from '../../../common/storage/local-storage.provider';

@Controller('materials')
export class MaterialsController {
  constructor(
    private readonly materialsService: MaterialsService,
    private readonly localStorage: LocalStorageProvider,
  ) {}

  @Post('upload-url')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tutor')
  createUploadUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateMaterialDto,
  ) {
    return this.materialsService.createUploadUrl(user.sub, dto);
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

  /**
   * Local-dev upload/download targets standing in for Supabase Storage's
   * presigned URLs. Unauthenticated by design, matching how a presigned
   * URL works — the unguessable random object key is the capability.
   * Real deployments never hit these; storage serves the bytes directly.
   */
  @Put('local-upload/:objectKey')
  async localUpload(
    @Param('objectKey') objectKey: string,
    @Req() request: FastifyRequest,
  ) {
    const key = this.materialsService.sanitizeLocalKey(
      decodeURIComponent(objectKey),
    );
    await this.localStorage.write(key, request.body as Buffer);
    return { stored: true };
  }

  @Get('local-download/:objectKey')
  async localDownload(
    @Param('objectKey') objectKey: string,
    @Res() reply: FastifyReply,
  ) {
    const key = this.materialsService.sanitizeLocalKey(
      decodeURIComponent(objectKey),
    );
    const body = await this.localStorage.read(key);
    // Helmet's default Cross-Origin-Resource-Policy: same-origin blocks the
    // browser from loading this cross-origin (API on :3001, web on :3000)
    // as an <img> — real deployments serve avatars from Supabase Storage's
    // own domain instead, so this only matters for this dev-only stand-in.
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
    return reply.send(body);
  }
}
