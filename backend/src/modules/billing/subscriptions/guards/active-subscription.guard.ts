import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../../identity/auth/guards/jwt-auth.guard';
import { SubscriptionsService } from '../subscriptions.service';

/** Must run after JwtAuthGuard — reads request.user set there. Gates
 *  tutor actions that create new business value (new batches, sessions)
 *  once the 90-day trial ends without an active paid subscription —
 *  existing data stays fully readable for the value-recap paywall
 *  (blueprint §5). */
@Injectable()
export class ActiveSubscriptionGuard implements CanActivate {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const active = await this.subscriptions.isActive(user.sub);
    if (!active) {
      // isActive() also lapses a paid subscription once current_period_end
      // passes (no renewal job exists yet — see subscriptions.service.ts),
      // so this same guard now covers both "trial ended" and "subscription
      // period ended" — status tells us which message actually applies.
      const { status } = await this.subscriptions.getStatus(user.sub);
      const message =
        status === 'active'
          ? 'Your subscription period has ended. Renew to keep going.'
          : 'Your trial has ended. Subscribe to keep going.';
      throw new HttpException({ error: 'TrialExpired', message }, HttpStatus.PAYMENT_REQUIRED);
    }
    return true;
  }
}
