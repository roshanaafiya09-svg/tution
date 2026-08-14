import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { AcademyOwnerService } from './academy-owner.service';
import { UpsertAcademyDto } from '../academies/dto/upsert-academy.dto';
import { AcademyImageUploadUrlDto } from '../academies/dto/academy-image-upload-url.dto';

/**
 * Self-serve Academy Dashboard — class-level guard mirrors
 * AdminController's/AcademyAdminController's convention exactly.
 * Every handler resolves "my academy" server-side from the caller's own
 * id (AcademyOwnerService.resolveOwnAcademy) — an academy user can never
 * pass another academy's id anywhere in this controller's surface.
 */
@Controller('academy')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('academy')
export class AcademyOwnerController {
  constructor(private readonly academyOwnerService: AcademyOwnerService) {}

  @Get('me')
  getMe(@CurrentUser() user: AccessTokenPayload) {
    return this.academyOwnerService.getMe(user.sub);
  }

  @Get('me/stats')
  getStats(@CurrentUser() user: AccessTokenPayload) {
    return this.academyOwnerService.getStats(user.sub);
  }

  @Put('me/profile')
  updateProfile(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpsertAcademyDto,
  ) {
    return this.academyOwnerService.updateProfile(user.sub, dto);
  }

  @Post('me/logo-upload-url')
  createLogoUploadUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: AcademyImageUploadUrlDto,
  ) {
    return this.academyOwnerService.createLogoUploadUrl(user.sub, dto);
  }

  @Post('me/cover-upload-url')
  createCoverUploadUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: AcademyImageUploadUrlDto,
  ) {
    return this.academyOwnerService.createCoverUploadUrl(user.sub, dto);
  }

  @Get('me/photos')
  listPhotos(@CurrentUser() user: AccessTokenPayload) {
    return this.academyOwnerService.listPhotos(user.sub);
  }

  @Post('me/photos')
  addPhoto(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: AcademyImageUploadUrlDto,
  ) {
    return this.academyOwnerService.addPhoto(user.sub, dto);
  }

  @Delete('me/photos/:photoId')
  removePhoto(
    @CurrentUser() user: AccessTokenPayload,
    @Param('photoId') photoId: string,
  ) {
    return this.academyOwnerService.removePhoto(user.sub, photoId);
  }

  @Get('me/teachers/active')
  listActiveTeachers(@CurrentUser() user: AccessTokenPayload) {
    return this.academyOwnerService.listActiveTeachers(user.sub);
  }

  @Get('me/teachers/pending')
  listPendingRequests(@CurrentUser() user: AccessTokenPayload) {
    return this.academyOwnerService.listPendingRequests(user.sub);
  }

  @Get('me/teachers/removed')
  listRemovedTeachers(@CurrentUser() user: AccessTokenPayload) {
    return this.academyOwnerService.listRemovedTeachers(user.sub);
  }

  @Post('me/teachers/:requestId/accept')
  acceptRequest(
    @CurrentUser() user: AccessTokenPayload,
    @Param('requestId') requestId: string,
  ) {
    return this.academyOwnerService.acceptRequest(user.sub, requestId);
  }

  @Post('me/teachers/:requestId/reject')
  rejectRequest(
    @CurrentUser() user: AccessTokenPayload,
    @Param('requestId') requestId: string,
  ) {
    return this.academyOwnerService.rejectRequest(user.sub, requestId);
  }

  @Delete('me/teachers/:membershipId')
  removeTeacher(
    @CurrentUser() user: AccessTokenPayload,
    @Param('membershipId') membershipId: string,
  ) {
    return this.academyOwnerService.removeTeacher(user.sub, membershipId);
  }

  @Get('me/contact-requests')
  listContactRequests(@CurrentUser() user: AccessTokenPayload) {
    return this.academyOwnerService.listContactRequests(user.sub);
  }

  @Post('me/contact-requests/:id/read')
  markContactRequestRead(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.academyOwnerService.markContactRequestRead(user.sub, id);
  }
}
