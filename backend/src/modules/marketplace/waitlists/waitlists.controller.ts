import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { WaitlistsService } from './waitlists.service';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';

@Controller('marketplace/waitlists')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WaitlistsController {
  constructor(private readonly waitlistsService: WaitlistsService) {}

  @Post()
  @Roles('student')
  join(@CurrentUser() user: AccessTokenPayload, @Body() dto: JoinWaitlistDto) {
    return this.waitlistsService.join(user.sub, dto);
  }

  @Get('me')
  @Roles('student')
  listOwn(@CurrentUser() user: AccessTokenPayload) {
    return this.waitlistsService.listOwn(user.sub);
  }

  @Delete(':id')
  @Roles('student')
  leave(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.waitlistsService.leave(user.sub, id);
  }

  /** Lets a tutor manually ping their waitlist (e.g. they opened up an
   *  extra slot outside of a cancellation) — same fan-out as the
   *  cancellation-triggered path in BookingsService. */
  @Post('tutor/:tutorSubjectId/notify')
  @Roles('tutor')
  notify(
    @CurrentUser() user: AccessTokenPayload,
    @Param('tutorSubjectId') tutorSubjectId: string,
  ) {
    return this.waitlistsService.notifyForTutorOwned(user.sub, tutorSubjectId);
  }
}
