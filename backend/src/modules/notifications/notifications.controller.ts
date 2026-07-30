import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../identity/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../identity/auth/tokens.service';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.notificationsService.listForUser(user.sub);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AccessTokenPayload) {
    return { count: await this.notificationsService.countUnread(user.sub) };
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.notificationsService.markRead(user.sub, id);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: AccessTokenPayload) {
    return this.notificationsService.markAllRead(user.sub);
  }
}
