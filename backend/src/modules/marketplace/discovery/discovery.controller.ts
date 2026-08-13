import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { DiscoveryService } from './discovery.service';
import { SearchTutorsDto } from './dto/search-tutors.dto';
import { ContactTeacherDto } from './dto/contact-teacher.dto';

@Controller('marketplace/discovery')
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get('tutors')
  searchTutors(@Query() query: SearchTutorsDto) {
    return this.discoveryService.searchTutors(query);
  }

  @Get('tutors/:slug')
  getPublicTutorPage(@Param('slug') slug: string) {
    return this.discoveryService.getPublicTutorPage(slug);
  }

  @Get('gate-status')
  async getGateStatus() {
    return { gateOpen: await this.discoveryService.isGateOpen() };
  }

  /** "Contact Teacher" from Find a Teacher — student or parent, before
   *  any booking/enrollment exists. */
  @Post('tutors/:slug/contact')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student', 'parent')
  contactTutor(
    @CurrentUser() user: AccessTokenPayload,
    @Param('slug') slug: string,
    @Body() dto: ContactTeacherDto,
  ) {
    const role = user.roles.includes('student') ? 'student' : 'parent';
    return this.discoveryService.contactTutor(slug, user.sub, role, dto);
  }

  @Get('contact-requests/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tutor')
  listOwnContactRequests(@CurrentUser() user: AccessTokenPayload) {
    return this.discoveryService.listContactRequestsForTutor(user.sub);
  }

  @Post('contact-requests/:id/read')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tutor')
  markContactRequestRead(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.discoveryService.markContactRequestRead(user.sub, id);
  }
}
