import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { PaymentsService } from './payments.service';
import { CreateSubscriptionOrderDto } from './dto/create-subscription-order.dto';
import { CreateParentPremiumOrderDto } from './dto/create-parent-premium-order.dto';
import { AddBlocksOrderDto } from './dto/add-blocks-order.dto';
import { CreateAcademySubscriptionOrderDto } from './dto/create-academy-subscription-order.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('fee/:feeLedgerId/order')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student', 'parent')
  createFeeOrder(
    @CurrentUser() user: AccessTokenPayload,
    @Param('feeLedgerId', ParseUUIDPipe) feeLedgerId: string,
  ) {
    return this.paymentsService.initiateFeeOrder(user, feeLedgerId);
  }

  /** The tutor's own plan purchase (blueprint §5) — distinct from fee
   *  collection above. Optional `extraBlocks` buys more 25-student blocks. */
  @Post('subscription/order')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tutor')
  createSubscriptionOrder(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateSubscriptionOrderDto,
  ) {
    return this.paymentsService.initiateSubscriptionOrder(
      user,
      dto.planId,
      dto.extraBlocks ?? 0,
    );
  }

  /** More 25-student blocks for the CURRENT paid period (the 26th student). */
  @Post('subscription/add-blocks-order')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tutor')
  createAddBlocksOrder(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: AddBlocksOrderDto,
  ) {
    return this.paymentsService.initiateAddBlocksOrder(user, dto.blocks);
  }

  /** The ACADEMY's own plan: N blocks + the per-teacher fee. Owner-only; the
   *  academy is resolved from the caller. */
  @Post('academy-subscription/order')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('academy')
  createAcademySubscriptionOrder(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateAcademySubscriptionOrderDto,
  ) {
    return this.paymentsService.initiateAcademySubscriptionOrder(
      user,
      dto.blocks,
    );
  }

  @Post('academy-subscription/add-blocks-order')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('academy')
  createAcademyAddBlocksOrder(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: AddBlocksOrderDto,
  ) {
    return this.paymentsService.initiateAcademyAddBlocksOrder(user, dto.blocks);
  }

  /** A parent's own AI premium purchase (blueprint §5/§10 Phase 3). */
  @Post('parent-premium/order')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('parent')
  createParentPremiumOrder(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateParentPremiumOrderDto,
  ) {
    return this.paymentsService.initiateParentPremiumOrder(user, dto.planId);
  }

  /** A student's 1:1 marketplace booking purchase. Body: none, the amount
   *  was snapshotted on the booking at creation time. */
  @Post('booking/:bookingId/order')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  createBookingOrder(
    @CurrentUser() user: AccessTokenPayload,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    return this.paymentsService.initiateBookingOrder(user, bookingId);
  }

  /** Settles the refund a cancelled booking's refund_percent already
   *  decided — call after POST /marketplace/bookings/:id/cancel. IDEMPOTENT:
   *  any number of (even concurrent) calls produce one refund. */
  @Post('booking/:bookingId/refund')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  refundBooking(
    @CurrentUser() user: AccessTokenPayload,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    return this.paymentsService.processBookingCancellationRefund(
      user,
      bookingId,
    );
  }

  /** The payer's own view of one payment's real state (what the UI polls
   *  after checkout — an order being CREATED is not a payment being PAID). */
  @Get(':paymentId')
  @UseGuards(JwtAuthGuard)
  getStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.paymentsService.getStatusForPayer(user, paymentId);
  }

  /** Dev/test-only — refused in production. Ownership (payer_id === caller)
   *  is enforced in the service, not by role. */
  @Post(':paymentId/simulate-capture')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student', 'parent', 'tutor', 'academy')
  simulateCapture(
    @CurrentUser() user: AccessTokenPayload,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.paymentsService.simulateCapture(user, paymentId);
  }

  /** Unauthenticated by design — the provider calls this directly. The HMAC
   *  signature (verified over request.rawBody, stashed by main.ts's content-
   *  type parser) is the authentication, and the provider's event id makes
   *  every delivery idempotent. */
  @Post('webhook')
  webhook(@Req() request: FastifyRequest) {
    const rawBody = (request as unknown as { rawBody: string }).rawBody ?? '';
    const signature = (request.headers['x-razorpay-signature'] as string) ?? '';
    const eventId = request.headers['x-razorpay-event-id'] as
      string | undefined;
    return this.paymentsService.handleWebhook(rawBody, signature, eventId);
  }
}
