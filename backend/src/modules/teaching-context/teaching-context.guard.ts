import {
  applyDecorators,
  CallHandler,
  CanActivate,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { AuthenticatedRequest } from '../identity/auth/guards/jwt-auth.guard';
import { TeachingContextService } from './teaching-context.service';
import {
  TEACHING_CONTEXT_HEADER,
  runInTeachingContext,
  type TeachingContext,
} from './teaching-context';

export interface TeachingContextRequest extends AuthenticatedRequest {
  teachingContext?: TeachingContext;
}

/** Must run after JwtAuthGuard. Resolves + verifies the caller's
 *  teaching context once per request (an Academy context is only honoured
 *  for an ACTIVE member). Safe to put on controllers that also serve
 *  students/parents: it only acts for callers holding the `tutor` role. */
@Injectable()
export class TeachingContextGuard implements CanActivate {
  constructor(private readonly service: TeachingContextService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TeachingContextRequest>();
    if (!request.user.roles.includes('tutor')) return true;

    const header = request.headers[TEACHING_CONTEXT_HEADER];
    request.teachingContext = await this.service.resolve(
      request.user.sub,
      Array.isArray(header) ? header[0] : header,
    );
    return true;
  }
}

/** Runs the route handler inside the verified context (AsyncLocalStorage
 *  `run`, so it can never leak to another request) — this is what lets
 *  BatchesService.getOwnedBatch reject a batch from the other context. */
@Injectable()
export class TeachingContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<TeachingContextRequest>();
    const ctx = request.teachingContext;
    if (!ctx) return next.handle();
    return new Observable((subscriber) =>
      runInTeachingContext(ctx, () => next.handle().subscribe(subscriber)),
    );
  }
}

/** Put on any tutor-facing controller/route that reads or writes
 *  teaching data: verifies the caller's context and binds it for the
 *  request. Order matters — apply after JwtAuthGuard/RolesGuard. */
export const TeachingContextScope = () =>
  applyDecorators(
    UseGuards(TeachingContextGuard),
    UseInterceptors(TeachingContextInterceptor),
  );
