import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { AcademyVerificationService } from './academy-verification.service';
import { StartAcademyVerificationDto } from './dto/start-academy-verification.dto';

/**
 * Owner-facing side of Academy KYC (Phase 1: state machine + consent
 * only). Every handler resolves "my academy" server-side from the
 * caller's own id, same invariant as AcademyOwnerController — an
 * academy user can never name another academy's verification here.
 */
@Controller('academy/verification')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('academy')
export class AcademyVerificationController {
  constructor(private readonly service: AcademyVerificationService) {}

  @Get('me')
  getMyStatus(@CurrentUser() user: AccessTokenPayload) {
    return this.service.getMyStatus(user.sub);
  }

  // Rate-limited on top of the global net: consent + a DB write per
  // call, and a low ceiling doesn't cost a legitimate owner anything —
  // one submission is normal, a burst of them is not.
  @Post('start')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  start(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: StartAcademyVerificationDto,
    @Req() request: FastifyRequest,
  ) {
    const userAgent: string | undefined = request.headers['user-agent'];
    return this.service.start(
      user.sub,
      dto,
      request.ip ?? null,
      userAgent ?? null,
    );
  }
}
