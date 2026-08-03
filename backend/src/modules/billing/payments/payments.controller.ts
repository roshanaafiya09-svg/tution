import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/auth/guards/roles.guard';
import { Roles } from '../../identity/auth/decorators/roles.decorator';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../identity/auth/tokens.service';
import { PaymentsService } from './payments.service';

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
   *  from fee collection above. Body: { planId }. */
  @Post('subscription/order')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tutor')
  createSubscriptionOrder(
    @CurrentUser() user: AccessTokenPayload,
    @Body('planId') planId: string,
  ) {
    return this.paymentsService.initiateSubscriptionOrder(user, planId);
  }

  /** Dev/test-only — see PaymentsProvider.simulateCapture. Shared by
   *  both flows above; ownership (payer_id === caller) is enforced in
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
