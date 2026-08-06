import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { PaymentsService } from './payments.service';
import { CreateSubscriptionOrderDto } from './dto/create-subscription-order.dto';
import { CreateParentPremiumOrderDto } from './dto/create-parent-premium-order.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('fee/:feeLedgerId/order')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student', 'parent')
  createFeeOrder(
    @CurrentUser() user: AccessTokenPayload,
    @Param('feeLedgerId') feeLedgerId: string,
  ) {
    return this.paymentsService.initiateFeeOrder(user, feeLedgerId);
  }

  /** The tutor's own subscription purchase (blueprint §5) — distinct
   *  from fee collection above. */
  @Post('subscription/order')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tutor')
  createSubscriptionOrder(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateSubscriptionOrderDto,
  ) {
    return this.paymentsService.initiateSubscriptionOrder(user, dto.planId);
  }

  /** A parent's own AI premium purchase (blueprint §5/§10 Phase 3) —
   *  distinct from fee collection and the tutor subscription above. */
  @Post('parent-premium/order')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('parent')
  createParentPremiumOrder(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateParentPremiumOrderDto,
  ) {
    return this.paymentsService.initiateParentPremiumOrder(user, dto.planId);
  }

  /** A student's 1:1 marketplace booking purchase (blueprint §5/§10
   *  Phase 4) — distinct from fee collection and both subscription
   *  purchases above. Body: none, the amount was snapshotted on the
   *  booking at creation time. */
  @Post('booking/:bookingId/order')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  createBookingOrder(
    @CurrentUser() user: AccessTokenPayload,
    @Param('bookingId') bookingId: string,
  ) {
    return this.paymentsService.initiateBookingOrder(user, bookingId);
  }

  /** Settles the refund a cancelled booking's refund_percent already
   *  decided (blueprint §10 Phase 4) — call after
   *  POST /marketplace/bookings/:id/cancel, not instead of it.
   *  Student-only: the refund credits back to whoever paid. */
  @Post('booking/:bookingId/refund')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  refundBooking(
    @CurrentUser() user: AccessTokenPayload,
    @Param('bookingId') bookingId: string,
  ) {
    return this.paymentsService.processBookingCancellationRefund(
      user,
      bookingId,
    );
  }

  /** Dev/test-only — see PaymentsProvider.simulateCapture. Shared by
   *  every flow above; ownership (payer_id === caller) is enforced in
   *  the service, not by role. */
  @Post(':paymentId/simulate-capture')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student', 'parent', 'tutor')
  simulateCapture(
    @CurrentUser() user: AccessTokenPayload,
    @Param('paymentId') paymentId: string,
  ) {
    return this.paymentsService.simulateCapture(user, paymentId);
  }

  /** Unauthenticated by design — Razorpay calls this directly. The HMAC
   *  signature (verified inside the service, against request.rawBody
   *  stashed by main.ts's content-type parser) is the auth. */
  @Post('webhook')
  webhook(@Req() request: FastifyRequest) {
    const rawBody = (request as unknown as { rawBody: string }).rawBody ?? '';
    const signature = (request.headers['x-razorpay-signature'] as string) ?? '';
    return this.paymentsService.handleWebhook(rawBody, signature);
  }
}
