import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../identity/auth/guards/roles.guard';
import { Roles } from '../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../identity/auth/tokens.service';
import { TeachingContextService } from './teaching-context.service';

@Controller('teaching-contexts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TeachingContextController {
  constructor(private readonly service: TeachingContextService) {}

  /** Profile switcher source: Individual + every academy the teacher is
   *  an ACTIVE member of. */
  @Get('me')
  @Roles('tutor')
  listMine(@CurrentUser() user: AccessTokenPayload) {
    return this.service.listAvailable(user.sub);
  }
}
