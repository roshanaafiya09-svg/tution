import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { TokensService } from '../tokens.service';
import type { AccessTokenPayload } from '../tokens.service';

export interface AuthenticatedRequest extends FastifyRequest {
  user: AccessTokenPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokensService: TokensService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      request.user = this.tokensService.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    // Super Admin "view as user" sessions (see AdminService.impersonate) can
    // only read data — every mutating verb is rejected here, in the one
    // guard almost every protected route already goes through, rather than
    // requiring each controller to opt in individually.
    if (request.user.impersonation && request.method !== 'GET') {
      throw new ForbiddenException('Impersonated sessions are read-only');
    }

    return true;
  }
}
