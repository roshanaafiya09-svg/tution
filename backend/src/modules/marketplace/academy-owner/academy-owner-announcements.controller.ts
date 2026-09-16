import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { AcademyOwnerAnnouncementsService } from './academy-owner-announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

/** Academy Dashboard -> Communication -> Announcements. Status/audience/
 *  search/date filtering happens client-side over the one full list, same
 *  convention as Contact Requests — see AcademyAnnouncementsRepository's
 *  doc comment. */
@Controller('academy/me/announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('academy')
export class AcademyOwnerAnnouncementsController {
  constructor(private readonly service: AcademyOwnerAnnouncementsService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.service.list(user.sub);
  }

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.service.create(user.sub, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.service.get(user.sub, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.service.update(user.sub, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.service.delete(user.sub, id);
  }

  @Post(':id/publish')
  publish(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.service.publish(user.sub, id);
  }

  @Post(':id/archive')
  archive(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.service.archive(user.sub, id);
  }
}
