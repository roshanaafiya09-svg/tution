import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { ProofOfTeachingService } from './proof-of-teaching.service';

@Controller('marketplace/proof-of-teaching')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('tutor')
export class ProofOfTeachingController {
  constructor(
    private readonly proofOfTeachingService: ProofOfTeachingService,
  ) {}

  @Get('me')
  getOwn(@CurrentUser() user: AccessTokenPayload) {
    return this.proofOfTeachingService.scoreForTutor(user.sub);
  }
}
