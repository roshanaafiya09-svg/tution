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
import { AcademiesService } from './academies.service';
import { SearchAcademiesDto } from './dto/search-academies.dto';
import { ContactAcademyDto } from './dto/contact-academy.dto';

@Controller('marketplace/academies')
export class AcademiesController {
  constructor(private readonly academiesService: AcademiesService) {}

  @Get()
  searchAcademies(@Query() query: SearchAcademiesDto) {
    return this.academiesService.searchAcademies(query);
  }

  @Get('gate-status')
  async getGateStatus() {
    return { gateOpen: await this.academiesService.isGateOpen() };
  }

  /** A teacher's own "Teaching under" list — backs the additive section
   *  on their existing Teacher Profile page. */
  @Get('me/memberships')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tutor')
  listOwnMemberships(@CurrentUser() user: AccessTokenPayload) {
    return this.academiesService.listMembershipsForTutor(user.sub);
  }

  @Get(':slug')
  getPublicAcademyPage(@Param('slug') slug: string) {
    return this.academiesService.getPublicAcademyPage(slug);
  }

  /** "Contact Academy" from Find an Academy — student or parent, before
   *  any relationship exists. */
  @Post(':slug/contact')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student', 'parent')
  contactAcademy(
    @CurrentUser() user: AccessTokenPayload,
    @Param('slug') slug: string,
    @Body() dto: ContactAcademyDto,
  ) {
    const role = user.roles.includes('student') ? 'student' : 'parent';
    return this.academiesService.contactAcademy(slug, user.sub, role, dto);
  }
}
