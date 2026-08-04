import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { RescheduleBookingDto } from './dto/reschedule-booking.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';

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

  /** Either party can request a reschedule — subject to the min-notice
   *  and max-reschedules policy (blueprint §10 Phase 4). */
  @Post(':id/reschedule')
  @Roles('student', 'tutor')
  reschedule(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: RescheduleBookingDto,
  ) {
    return this.bookingsService.reschedule(user.sub, id, dto);
  }

  /** Either party can cancel — the refund percent (0/50/100) is decided
   *  by who cancelled and how much notice was given (blueprint §10
   *  Phase 4). Trigger the actual refund separately via
   *  POST /payments/booking/:id/refund once this returns. */
  @Post(':id/cancel')
  @Roles('student', 'tutor')
  cancel(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookingsService.cancel(user.sub, id, dto);
  }

  @Post(':id/complete')
  @Roles('tutor')
  complete(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.bookingsService.complete(user.sub, id);
  }

  @Post(':id/no-show')
  @Roles('tutor')
  noShow(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.bookingsService.noShow(user.sub, id);
  }
}
