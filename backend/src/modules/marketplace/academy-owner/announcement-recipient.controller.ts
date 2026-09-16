import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { AnnouncementRecipientService } from './announcement-recipient.service';

/** Any authenticated role can hit this — same guard stack as
 *  NotificationsController (JwtAuthGuard only, no RolesGuard/@Roles),
 *  since a recipient could be a tutor, student, or parent. Authorization
 *  is per-announcement, done inside the service via proof of receipt,
 *  not via a role check here. */
@Controller('announcements')
@UseGuards(JwtAuthGuard)
export class AnnouncementRecipientController {
  constructor(private readonly service: AnnouncementRecipientService) {}

  @Get(':id')
  get(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.service.getForRecipient(user.sub, id);
  }
}
