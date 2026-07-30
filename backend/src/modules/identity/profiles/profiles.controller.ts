import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/tokens.service';
import { ProfilesService } from './profiles.service';
import { UpsertTutorProfileDto } from './dto/upsert-tutor-profile.dto';
import { UpsertStudentProfileDto } from './dto/upsert-student-profile.dto';

@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Put('tutor')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tutor')
  upsertTutorProfile(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpsertTutorProfileDto,
  ) {
    return this.profilesService.upsertTutorProfile(user.sub, dto);
  }

  @Get('tutor/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tutor')
  getOwnTutorProfile(@CurrentUser() user: AccessTokenPayload) {
    return this.profilesService.getTutorProfile(user.sub);
  }

  @Get('tutor/:slug')
  getPublicTutorProfile(@Param('slug') slug: string) {
    return this.profilesService.getPublicTutorProfile(slug);
  }

  @Put('student')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  upsertStudentProfile(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpsertStudentProfileDto,
  ) {
    return this.profilesService.upsertStudentProfile(user.sub, dto);
  }

  @Get('student/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  getOwnStudentProfile(@CurrentUser() user: AccessTokenPayload) {
    return this.profilesService.getStudentProfile(user.sub);
  }
}
