import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import type { UserRole } from '../../../database/types';
import { VerificationsService } from './verifications.service';
import { CreateVerificationUploadDto } from './dto/create-verification-upload.dto';
import { ReviewVerificationDto } from './dto/review-verification.dto';

const REVIEWER_ROLES: UserRole[] = ['trust_safety', 'superadmin'];

@Controller('verifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VerificationsController {
  constructor(private readonly service: VerificationsService) {}

  @Post('upload-url')
  @Roles('tutor')
  createUploadUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateVerificationUploadDto,
  ) {
    return this.service.createUploadUrl(user.sub, dto);
  }

  @Get('me')
  @Roles('tutor')
  listOwn(@CurrentUser() user: AccessTokenPayload) {
    return this.service.listOwn(user.sub);
  }

  /** Blueprint §4: manual review queue, SLA <24h. */
  @Get('queue')
  @Roles(...REVIEWER_ROLES)
  listQueue() {
    return this.service.listQueue();
  }

  /** No @Roles here on purpose — the owning tutor may also fetch their own document. */
  @Get(':id/download-url')
  getDownloadUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    const isReviewer = user.roles.some((role) => REVIEWER_ROLES.includes(role));
    return this.service.getDownloadUrl(user.sub, isReviewer, id);
  }

  @Post(':id/review')
  @Roles(...REVIEWER_ROLES)
  review(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: ReviewVerificationDto,
  ) {
    const actorRole =
      user.roles.find((role) => REVIEWER_ROLES.includes(role)) ?? user.roles[0];
    return this.service.review(user.sub, actorRole, id, dto);
  }
}
