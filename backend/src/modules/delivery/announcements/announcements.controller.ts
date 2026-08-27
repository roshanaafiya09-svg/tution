import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

@Controller('announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Post('batch/:batchId')
  @Roles('tutor')
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Param('batchId') batchId: string,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.announcementsService.create(user.sub, batchId, dto.body);
  }

  /** Bulk sibling of listForBatch — announcements across every batch the
   *  student is enrolled in, in one call. Registered before 'batch/:batchId'
   *  is irrelevant here since the literal prefixes differ ('mine' vs
   *  'batch'), but kept alongside it for readability. */
  @Get('mine')
  @Roles('student')
  listMine(@CurrentUser() user: AccessTokenPayload) {
    return this.announcementsService.listForOwnEnrolledBatches(user.sub);
  }

  @Get('batch/:batchId')
  listForBatch(
    @CurrentUser() user: AccessTokenPayload,
    @Param('batchId') batchId: string,
  ) {
    return this.announcementsService.listForBatch(
      user.sub,
      batchId,
      user.roles.includes('tutor'),
    );
  }
}
