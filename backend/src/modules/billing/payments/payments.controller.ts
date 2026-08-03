import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
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
  createOrder(
    @CurrentUser() user: AccessTokenPayload,
    @Param('feeLedgerId') feeLedgerId: string,
  ) {
    return this.paymentsService.initiateOrder(user, feeLedgerId);
  }

  /** Dev/test-only — see PaymentsProvider.simulateCapture. */
  @Post(':paymentId/simulate-capture')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student', 'parent')
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
