import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';

@Controller('marketplace/bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @Roles('student')
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingsService.create(user.sub, dto);
  }

  @Get('me')
  @Roles('student')
  listOwn(@CurrentUser() user: AccessTokenPayload) {
    return this.bookingsService.listForStudent(user.sub);
  }

  @Get('tutor')
  @Roles('tutor')
  listForTutor(@CurrentUser() user: AccessTokenPayload) {
    return this.bookingsService.listForTutor(user.sub);
  }
}
