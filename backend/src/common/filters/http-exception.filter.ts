import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import * as Sentry from '@sentry/nestjs';

/** Route + caller for an error log line. Only the path (no query string,
 *  which can carry tokens or PII) and the authenticated user id. */
function describeRequest(request: FastifyRequest | undefined): string {
  if (!request) return 'unknown request';
  const path = (request.url ?? '').split('?')[0];
  const user = (request as FastifyRequest & { user?: { sub?: string } }).user;
  return `${request.method} ${path}${user?.sub ? ` (user ${user.sub})` : ''}`;
}

/** node-postgres attaches the SQLSTATE to its errors — surfacing it in the
 *  log is what turns "Internal server error" into "22P02 invalid input
 *  syntax for type uuid" without needing a debugger. */
function pgCode(exception: unknown): string | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const code = (exception as { code?: unknown }).code;
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : null;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const body = isHttpException
      ? exception.getResponse()
      : { message: 'Internal server error' };

    if (!isHttpException) {
      const code = pgCode(exception);
      this.logger.error(
        `Unhandled error on ${describeRequest(ctx.getRequest<FastifyRequest>())}${code ? ` [SQLSTATE ${code}]` : ''}: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
      Sentry.captureException(exception);
    }

    reply
      .status(status)
      .send(
        typeof body === 'string'
          ? { statusCode: status, message: body }
          : { statusCode: status, ...body },
      );
  }
}
