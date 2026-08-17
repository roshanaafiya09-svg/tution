import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import type { UserRole } from '../../../database/types';
import { AcademyVerificationService } from './academy-verification.service';
import { ReviewAcademyVerificationDto } from './dto/review-academy-verification.dto';

const REVIEWER_ROLES: UserRole[] = ['trust_safety', 'superadmin'];

/**
 * Reviewer side of Academy KYC — the manual-review queue Phase 1 relies
 * on entirely, since no automated provider is wired in yet. Same
 * reviewer-role gate as tutor verification (trust/verifications).
 */
@Controller('admin/academy-verifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...REVIEWER_ROLES)
export class AcademyAdminVerificationController {
  constructor(private readonly service: AcademyVerificationService) {}

  @Get('queue')
  listQueue() {
    return this.service.listQueue();
  }

  @Post(':id/review')
  review(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: ReviewAcademyVerificationDto,
  ) {
    const actorRole =
      user.roles.find((role) => REVIEWER_ROLES.includes(role)) ?? user.roles[0];
    return this.service.review(user.sub, actorRole, id, dto);
  }
}
