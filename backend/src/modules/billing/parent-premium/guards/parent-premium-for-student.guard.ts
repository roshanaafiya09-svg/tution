import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../../identity/auth/guards/jwt-auth.guard';
import { ParentPremiumService } from '../parent-premium.service';

/** Must run after JwtAuthGuard. Gates the student-facing AI doubt
 *  solver: request.user is the *student* here, so this checks whether
 *  any of their actively-linked parents holds premium, not the
 *  student's own (nonexistent) subscription — the doubt solver is
 *  entirely new in Phase 3, so unlike ActiveSubscriptionGuard there's
 *  no free tier underneath to fall back to. */
@Injectable()
export class ParentPremiumForStudentGuard implements CanActivate {
  constructor(private readonly parentPremium: ParentPremiumService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const active = await this.parentPremium.isActiveForStudent(user.sub);
    if (!active) {
      throw new HttpException(
        {
          error: 'ParentPremiumRequired',
          message:
            'The AI doubt solver requires an active Parent Premium subscription — ask your parent to subscribe.',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return true;
  }
}
