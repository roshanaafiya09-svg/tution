import { timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';

export const CRON_SECRET_HEADER = 'x-cron-secret';

/** Constant-time comparison so response timing cannot leak the secret. */
function secretsMatch(expected: string, given: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Guards `POST /internal/jobs/:job` (audit H7). No `CRON_SECRET` configured
 * means the route is entirely unusable (503) — never "falls open" to
 * unauthenticated. The route is never listed as `@Public()`; this guard is
 * on top of the normal auth pipeline being absent for it by design (an
 * external scheduler has no user session), same shape as the Razorpay
 * webhook's HMAC signature standing in for a bearer token.
 */
@Injectable()
export class CronSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('app.cronSecret');
    if (!expected) {
      throw new ServiceUnavailableException(
        'CRON_SECRET is not configured — the scheduled-jobs endpoint is disabled.',
      );
    }
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const header = request.headers[CRON_SECRET_HEADER];
    const given = Array.isArray(header) ? header[0] : header;
    if (!given || !secretsMatch(expected, given)) {
      throw new UnauthorizedException('Invalid or missing cron secret');
    }
    return true;
  }
}
