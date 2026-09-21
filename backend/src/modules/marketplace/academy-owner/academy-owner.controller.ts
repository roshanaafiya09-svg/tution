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
import { AcademyOwnerService } from './academy-owner.service';
import { AcademyOwnerBatchesService } from './academy-owner-batches.service';
import { UpsertAcademyDto } from '../academies/dto/upsert-academy.dto';
import { AcademyImageUploadUrlDto } from '../academies/dto/academy-image-upload-url.dto';
import { ReorderAcademyPhotosDto } from '../academies/dto/reorder-academy-photos.dto';
import { UpdateAcademySettingsDto } from './dto/update-academy-settings.dto';
import { UpdateContactRequestStatusDto } from './dto/update-contact-request-status.dto';

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
  constructor(
    private readonly academyOwnerService: AcademyOwnerService,
    private readonly academyOwnerBatchesService: AcademyOwnerBatchesService,
  ) {}

  /** Every student currently enrolled across the academy's active
   *  teachers' batches — the academy-wide student directory backing the
   *  Main "Students" nav item. Optional filters narrow the in-memory list
   *  (the roster is bounded to one academy, so no need to push filtering
   *  into SQL). */
  @Get('me/students')
  listStudents(
    @CurrentUser() user: AccessTokenPayload,
    @Query('q') q?: string,
    @Query('batchId') batchId?: string,
    @Query('tutorId') tutorId?: string,
    @Query('status') status?: string,
  ) {
    return this.academyOwnerBatchesService.listStudentsAcrossAcademy(user.sub, {
      q,
      batchId,
      tutorId,
      status,
    });
  }

  /** Single student's detail view — academy-wide, not scoped to one batch.
   *  Ownership is derived the same way as the list above: the student must
   *  have an active enrollment in one of the academy's active teachers'
   *  batches. */
  @Get('me/students/:studentId')
  getStudentDetail(
    @CurrentUser() user: AccessTokenPayload,
    @Param('studentId') studentId: string,
  ) {
    return this.academyOwnerBatchesService.getStudentDetail(
      user.sub,
      studentId,
    );
  }

  /** Powers Today's "Classes happening today"/"Upcoming Classes" — a
   *  window of sessions across every active member tutor. Defaults to a
   *  14-day-ahead window, same default as the tutor-facing /sessions/me. */
  @Get('me/sessions')
  listSessions(
    @CurrentUser() user: AccessTokenPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const start = from ? new Date(from) : new Date();
    const end = to
      ? new Date(to)
      : new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
    return this.academyOwnerBatchesService.listSessionsAcrossAcademy(
      user.sub,
      start,
      end,
    );
  }

  @Get('me')
  getMe(@CurrentUser() user: AccessTokenPayload) {
    return this.academyOwnerService.getMe(user.sub);
  }

  /** Self-serve signup's bootstrap step — see
   *  AcademyOwnerService.createMyAcademy's doc comment. */
  @Post('me')
  createMyAcademy(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpsertAcademyDto,
  ) {
    return this.academyOwnerService.createMyAcademy(user.sub, dto);
  }

  /** The ACADEMY's own plan/trial state — separate from any member
   *  teacher's Individual plan. */
  @Get('me/subscription')
  getSubscription(@CurrentUser() user: AccessTokenPayload) {
    return this.academyOwnerService.getSubscription(user.sub);
  }

  @Get('me/stats')
  getStats(@CurrentUser() user: AccessTokenPayload) {
    return this.academyOwnerService.getStats(user.sub);
  }

  @Get('me/academic-info')
  getAcademicInfo(@CurrentUser() user: AccessTokenPayload) {
    return this.academyOwnerService.getAcademicInfo(user.sub);
  }

  @Put('me/profile')
  updateProfile(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpsertAcademyDto,
  ) {
    return this.academyOwnerService.updateProfile(user.sub, dto);
  }

  @Put('me/settings')
  updateSettings(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateAcademySettingsDto,
  ) {
    return this.academyOwnerService.updateSettings(
      user.sub,
      dto.autoObserveGovtHolidays,
    );
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

  @Put('me/photos/order')
  reorderPhotos(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: ReorderAcademyPhotosDto,
  ) {
    return this.academyOwnerService.reorderPhotos(user.sub, dto.photoIds);
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

  /** Single teacher's detail view — profile, academy membership, teaching
   *  load, and leave history at this academy. No salary/fees. Registered
   *  after the literal 'active'/'pending'/'removed' routes above so those
   *  keep matching first — Nest resolves routes in declaration order, same
   *  as Express. */
  @Get('me/teachers/:tutorId')
  getTeacherDetail(
    @CurrentUser() user: AccessTokenPayload,
    @Param('tutorId') tutorId: string,
  ) {
    return this.academyOwnerService.getTeacherDetail(user.sub, tutorId);
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

  @Put('me/contact-requests/:id/status')
  updateContactRequestStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdateContactRequestStatusDto,
  ) {
    return this.academyOwnerService.updateContactRequestStatus(
      user.sub,
      id,
      dto.status,
    );
  }
}
