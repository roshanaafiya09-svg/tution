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
      throw new HttpException(
        {
          error: 'TrialExpired',
          message: 'Your trial has ended. Subscribe to keep going.',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return true;
  }
}
