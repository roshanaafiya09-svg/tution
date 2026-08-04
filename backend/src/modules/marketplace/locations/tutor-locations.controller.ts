import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { TutorLocationsService } from './tutor-locations.service';
import { UpsertTutorLocationDto } from './dto/upsert-tutor-location.dto';

@Controller('marketplace/locations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('tutor')
export class TutorLocationsController {
  constructor(private readonly tutorLocationsService: TutorLocationsService) {}

  @Get('me')
  getOwn(@CurrentUser() user: AccessTokenPayload) {
    return this.tutorLocationsService.getOwn(user.sub);
  }

  @Put()
  upsert(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpsertTutorLocationDto,
  ) {
    return this.tutorLocationsService.upsert(user.sub, dto);
  }
}
