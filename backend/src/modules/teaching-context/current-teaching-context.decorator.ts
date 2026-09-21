import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { TeachingContextRequest } from './teaching-context.guard';
import { INDIVIDUAL_CONTEXT } from './teaching-context';

/** The verified context set by TeachingContextGuard. Falls back to
 *  Individual if the guard wasn't applied — never to an Academy. */
export const CurrentTeachingContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<TeachingContextRequest>().teachingContext ??
    INDIVIDUAL_CONTEXT,
);
