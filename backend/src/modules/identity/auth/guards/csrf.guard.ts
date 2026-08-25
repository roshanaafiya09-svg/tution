import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { TokensService } from '../tokens.service';

/**
 * Guards /auth/logout against cross-site forgery from the web client's
 * httpOnly refresh cookie. The cookie is `SameSite=None` (web/API are on
 * different domains), which by itself gives no CSRF protection — any
 * site could trigger a same-shaped request and have the cookie attached
 * automatically. A forged logout actually ends the victim's session, so
 * it's worth protecting; /auth/refresh deliberately does NOT use this
 * guard (see the comment on AuthController.refresh) since a forged
 * refresh is low-consequence and protecting it would lock legitimate
 * users out on every page reload — the CSRF token is memory-only and
 * doesn't survive one.
 *
 * Mobile never sends this cookie (it posts `refreshToken` in the body
 * instead), so a request with no `refresh_token` cookie is the mobile
 * path and passes through untouched — there's nothing here for CSRF to
 * exploit since no ambient credential is being relied on.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly tokensService: TokensService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const cookieToken = (request.cookies as Record<string, string> | undefined)
      ?.refresh_token;
    if (!cookieToken) return true;

    const jti = this.tokensService.peekRefreshJti(cookieToken);
    if (!jti) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const header = request.headers['x-csrf-token'];
    const candidate = Array.isArray(header) ? header[0] : header;
    if (!candidate || !this.tokensService.verifyCsrfToken(jti, candidate)) {
      throw new ForbiddenException('Missing or invalid CSRF token');
    }

    return true;
  }
}
