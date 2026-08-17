import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { AcademyAdminService } from './academy-admin.service';
import { UpsertAcademyDto } from './dto/upsert-academy.dto';
import { AcademyImageUploadUrlDto } from './dto/academy-image-upload-url.dto';
import { AddMembershipDto } from './dto/add-membership.dto';
import { LinkAcademyOwnerDto } from './dto/link-academy-owner.dto';

/**
 * Superadmin only, enforced here (not just hidden in the UI) — mirrors
 * AdminController's class-level gating convention exactly. No self-serve
 * Academy Dashboard/owner role exists yet (see migration 0030's doc
 * comment), so this is the only way to manage real academy data.
 */
@Controller('admin/academies')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')
export class AcademyAdminController {
  constructor(private readonly academyAdminService: AcademyAdminService) {}

  @Get()
  listAll(@Query('q') q?: string) {
    return this.academyAdminService.listAll(q);
  }

  @Post()
  create(@Body() dto: UpsertAcademyDto) {
    return this.academyAdminService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpsertAcademyDto) {
    return this.academyAdminService.update(id, dto);
  }

  @Post(':id/verification-status')
  setVerificationStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body('status') status: 'pending' | 'verified' | 'rejected',
  ) {
    return this.academyAdminService.setVerificationStatus(user.sub, id, status);
  }

  @Post(':id/logo-upload-url')
  createLogoUploadUrl(
    @Param('id') id: string,
    @Body() dto: AcademyImageUploadUrlDto,
  ) {
    return this.academyAdminService.createLogoUploadUrl(id, dto);
  }

  @Post(':id/cover-upload-url')
  createCoverUploadUrl(
    @Param('id') id: string,
    @Body() dto: AcademyImageUploadUrlDto,
  ) {
    return this.academyAdminService.createCoverUploadUrl(id, dto);
  }

  @Post(':id/photos')
  addPhoto(@Param('id') id: string, @Body() dto: AcademyImageUploadUrlDto) {
    return this.academyAdminService.addPhoto(id, dto);
  }

  @Delete('photos/:photoId')
  removePhoto(@Param('photoId') photoId: string) {
    return this.academyAdminService.removePhoto(photoId);
  }

  /** Creates/links the academy's self-serve owner account and grants the
   *  `academy` role — see AcademyAdminService.linkOwner. */
  @Post(':id/owner')
  linkOwner(@Param('id') id: string, @Body() dto: LinkAcademyOwnerDto) {
    return this.academyAdminService.linkOwner(id, dto);
  }

  @Post(':id/memberships')
  addMembership(@Param('id') id: string, @Body() dto: AddMembershipDto) {
    return this.academyAdminService.addMembership(id, dto);
  }

  @Delete('memberships/:membershipId')
  removeMembership(@Param('membershipId') membershipId: string) {
    return this.academyAdminService.removeMembership(membershipId);
  }

  @Get(':id/contact-requests')
  listContactRequests(@Param('id') id: string) {
    return this.academyAdminService.listContactRequests(id);
  }

  @Post('contact-requests/:requestId/read')
  markContactRequestRead(@Param('requestId') requestId: string) {
    return this.academyAdminService.markContactRequestRead(requestId);
  }
}
