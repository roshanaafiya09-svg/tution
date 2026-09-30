import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AccessTokenPayload } from '../../modules/identity/auth/tokens.service';

/**
 * Audit finding M4: the global limiter (and every route using the plain
 * `ThrottlerGuard`) tracks by client IP, so one authenticated user can
 * exhaust their budget and simply rotate IPs — or share an IP's budget
 * with every other user behind it (NAT, campus wifi, a proxy). Routes
 * where a single AUTHENTICATED user spamming is the actual risk (contact
 * requests, messages, announcements, invites) key on the user instead.
 *
 * Placed after JwtAuthGuard in `@UseGuards(...)` (guard order is execution
 * order), so `req.user` is already populated here. Falls back to IP for
 * the rare case this ever guards a route reachable without auth.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: {
    user?: AccessTokenPayload;
    ip: string;
  }): Promise<string> {
    return req.user ? `user:${req.user.sub}` : req.ip;
  }
}
