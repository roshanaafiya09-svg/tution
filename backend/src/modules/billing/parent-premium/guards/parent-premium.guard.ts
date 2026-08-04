import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../../identity/auth/guards/jwt-auth.guard';
import { ParentPremiumService } from '../parent-premium.service';

/** Must run after JwtAuthGuard — reads request.user set there. Gates a
 *  parent's own actions that create new "rich" AI value (e.g. richer
 *  digest generation) once no active premium subscription exists.
 *  Existing data (already-generated digests) stays fully readable —
 *  same "gate creation, not reading" philosophy as ActiveSubscriptionGuard. */
@Injectable()
export class ParentPremiumGuard implements CanActivate {
  constructor(private readonly parentPremium: ParentPremiumService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const active = await this.parentPremium.isActive(user.sub);
    if (!active) {
      throw new HttpException(
        {
          error: 'ParentPremiumRequired',
          message: 'This requires an active Parent Premium subscription.',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return true;
  }
}
