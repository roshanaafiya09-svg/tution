import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { TeachingContextRequest } from '../../../teaching-context/teaching-context.guard';
import { SubscriptionsService } from '../subscriptions.service';
import { AcademySubscriptionsService } from '../academy-subscriptions.service';

/** Must run after JwtAuthGuard AND TeachingContextGuard (see
 *  TeachingContextScope) — reads request.user / request.teachingContext.
 *  Gates tutor actions that create new business value (new batches,
 *  sessions) once the 90-day trial ends without an active paid
 *  subscription — existing data stays fully readable for the value-recap
 *  paywall (blueprint §5).
 *
 *  WHO PAYS follows the teaching context of what is being created:
 *   - Individual profile -> the TEACHER's own plan must be active.
 *   - Academy profile    -> the ACADEMY's plan must be active. The
 *     teacher's personal plan is neither required nor consulted (and an
 *     expired personal plan can't block academy work), while an academy
 *     plan can never keep a teacher's Individual business going. */
@Injectable()
export class ActiveSubscriptionGuard implements CanActivate {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly academySubscriptions: AcademySubscriptionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TeachingContextRequest>();
    const { user } = request;

    const teachingContext = request.teachingContext;
    if (teachingContext?.kind === 'academy') {
      await this.academySubscriptions.assertActive(teachingContext.academyId);
      return true;
    }

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
      throw new HttpException(
        { error: 'TrialExpired', message },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return true;
  }
}
