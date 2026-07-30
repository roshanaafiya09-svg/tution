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
import { AvailabilityService } from './availability.service';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { CreateAvailabilityExceptionDto } from './dto/create-availability-exception.dto';

@Controller('availability')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('tutor')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get('me')
  listOwn(@CurrentUser() user: AccessTokenPayload) {
    return this.availabilityService.listForTutor(user.sub);
  }

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateAvailabilityDto,
  ) {
    return this.availabilityService.create(user.sub, dto);
  }

  @Delete(':id')
  delete(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.availabilityService.delete(user.sub, id);
  }

  @Get('exceptions/me')
  listOwnExceptions(@CurrentUser() user: AccessTokenPayload) {
    return this.availabilityService.listExceptionsForTutor(user.sub);
  }

  @Post('exceptions')
  createException(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateAvailabilityExceptionDto,
  ) {
    return this.availabilityService.createException(user.sub, dto);
  }

  @Delete('exceptions/:id')
  deleteException(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.availabilityService.deleteException(user.sub, id);
  }
}
