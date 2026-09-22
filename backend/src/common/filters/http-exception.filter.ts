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
import {
  ErrorCode,
  type ErrorCodeValue,
  defaultCodeForStatus,
  isFrameworkDefaultMessage,
  safeMessageForStatus,
} from '../http/error-codes';
import { TEACHING_CONTEXT_HEADER } from '../../modules/teaching-context/teaching-context';

/**
 * The single error envelope every failed response uses:
 *
 *   { statusCode, code, error, message, requestId, details? }
 *
 * - `code`      stable machine-readable identifier (see ErrorCode)
 * - `message`   safe to show a user — never a stack, SQL, or provider text
 * - `requestId` the id this request was logged under (also X-Request-Id)
 * - `error`     the HTTP reason phrase, kept for older clients
 * - `details`   per-field validation messages, when there are several
 *
 * Extra top-level keys a thrower attached (e.g. the health check's
 * database/redis flags) are preserved.
 */
export interface ApiErrorBody {
  statusCode: number;
  code: string;
  error: string;
  message: string;
  requestId: string | null;
  details?: string[];
  [extra: string]: unknown;
}

const RESERVED_KEYS = new Set([
  'statusCode',
  'code',
  'error',
  'message',
  'requestId',
  'details',
]);

const HTTP_REASON: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

type UserRequest = FastifyRequest & { user?: { sub?: string } };

/** Route + caller for a log line. Only the path (no query string, which can
 *  carry tokens or PII) and the authenticated user id. */
function requestPath(request: FastifyRequest | undefined): string {
  return (request?.url ?? '').split('?')[0];
}

/** node-postgres attaches the SQLSTATE to its errors — surfacing it in the
 *  log is what turns "Internal server error" into "22P02 invalid input
 *  syntax for type uuid" without needing a debugger. */
function pgCode(exception: unknown): string | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const code = (exception as { code?: unknown }).code;
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : null;
}

const NETWORK_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

/**
 * A backing service dropping or refusing a connection is the API being
 * temporarily unavailable, not a bug in the request — reporting it as 503
 * (rather than an opaque 500) is what lets clients retry it and tell the
 * user "try again shortly" instead of "something is broken".
 * SQLSTATE class 08 = connection exception; 57P01/57P02/57P03 = server
 * shutting down / not accepting; 53300 = too many connections.
 */
function isDependencyOutage(exception: unknown): boolean {
  if (typeof exception !== 'object' || exception === null) return false;
  const code = (exception as { code?: unknown }).code;
  if (typeof code === 'string') {
    if (NETWORK_ERROR_CODES.has(code)) return true;
    if (code.startsWith('08') || ['57P01', '57P02', '57P03', '53300'].includes(code)) {
      return true;
    }
  }
  const message = exception instanceof Error ? exception.message : '';
  return /connection terminated|connection timeout|timeout exceeded when trying to connect|max clients/i.test(
    message,
  );
}

/** Non-Nest errors that already know their HTTP status (Fastify's own
 *  body-parse / payload-size errors). Only 4xx are trusted — anything else
 *  is a genuine server failure. */
function clientErrorStatus(exception: unknown): number | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const status = (exception as { statusCode?: unknown }).statusCode;
  return typeof status === 'number' && status >= 400 && status < 500
    ? status
    : null;
}

interface Resolved {
  status: number;
  code: ErrorCodeValue | string;
  message: string;
  details?: string[];
  extra: Record<string, unknown>;
  /** The real, un-sanitised message — for logs only. */
  internalMessage: string;
}

function resolveHttpException(exception: HttpException): Resolved {
  const status = exception.getStatus();
  const response = exception.getResponse();
  const extra: Record<string, unknown> = {};
  let code: string | undefined;
  let rawMessage: string | string[] | undefined;

  if (typeof response === 'string') {
    rawMessage = response;
  } else if (typeof response === 'object' && response !== null) {
    const body = response as Record<string, unknown>;
    if (typeof body.code === 'string') code = body.code;
    if (typeof body.message === 'string' || Array.isArray(body.message)) {
      rawMessage = body.message as string | string[];
    }
    for (const [key, value] of Object.entries(body)) {
      if (!RESERVED_KEYS.has(key)) extra[key] = value;
    }
  }

  const internalMessage = Array.isArray(rawMessage)
    ? rawMessage.join('; ')
    : (rawMessage ?? exception.message);

  // class-validator failures arrive as an array of messages.
  const details = Array.isArray(rawMessage) ? rawMessage.map(String) : undefined;
  if (details && !code) code = ErrorCode.VALIDATION_FAILED;

  const resolvedCode = code ?? defaultCodeForStatus(status);

  let message: string;
  if (status >= 500) {
    // A 5xx thrower's own message may describe internals (a missing env
    // var, a provider name). It only reaches the user if the thrower
    // vouched for it by giving the error an explicit code.
    message =
      code && internalMessage
        ? internalMessage
        : safeMessageForStatus(status);
  } else if (details) {
    message = details.join(', ');
  } else if (!internalMessage || isFrameworkDefaultMessage(internalMessage)) {
    message = safeMessageForStatus(status);
  } else {
    message = internalMessage;
  }

  return {
    status,
    code: resolvedCode,
    message,
    details,
    extra,
    internalMessage,
  };
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<UserRequest | undefined>();

    let resolved: Resolved;
    if (exception instanceof HttpException) {
      resolved = resolveHttpException(exception);
    } else if (clientErrorStatus(exception) !== null) {
      const status = clientErrorStatus(exception) as number;
      resolved = {
        status,
        code: defaultCodeForStatus(status),
        message: safeMessageForStatus(status),
        extra: {},
        internalMessage:
          exception instanceof Error ? exception.message : String(exception),
      };
    } else if (isDependencyOutage(exception)) {
      resolved = {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: ErrorCode.DEPENDENCY_UNAVAILABLE,
        message: safeMessageForStatus(HttpStatus.SERVICE_UNAVAILABLE),
        extra: {},
        internalMessage:
          exception instanceof Error ? exception.message : String(exception),
      };
    } else {
      resolved = {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: ErrorCode.INTERNAL_ERROR,
        message: safeMessageForStatus(HttpStatus.INTERNAL_SERVER_ERROR),
        extra: {},
        internalMessage:
          exception instanceof Error ? exception.message : String(exception),
      };
    }

    const requestId = request?.id ?? null;
    this.log(exception, resolved, request, requestId, reply);

    const body: ApiErrorBody = {
      ...resolved.extra,
      statusCode: resolved.status,
      code: resolved.code,
      error: HTTP_REASON[resolved.status] ?? 'Error',
      message: resolved.message,
      requestId,
      ...(resolved.details ? { details: resolved.details } : {}),
    };

    void reply.status(resolved.status).send(body);
  }

  /**
   * One structured line per failed request. Everything needed to trace a
   * browser-side failure server-side is on it: the requestId the client also
   * saw, who was asking, which teaching context they claimed, and the REAL
   * error (which is deliberately not in the response body for 5xx).
   * 4xx are `warn` (the caller's doing), 5xx are `error` (ours).
   */
  private log(
    exception: unknown,
    resolved: Resolved,
    request: UserRequest | undefined,
    requestId: string | null,
    reply: FastifyReply,
  ): void {
    const teachingContext = request?.headers?.[TEACHING_CONTEXT_HEADER];
    const line = JSON.stringify({
      event: 'http_error',
      requestId,
      method: request?.method,
      path: requestPath(request),
      statusCode: resolved.status,
      code: resolved.code,
      message: resolved.internalMessage,
      userId: request?.user?.sub ?? null,
      teachingContext: Array.isArray(teachingContext)
        ? teachingContext[0]
        : (teachingContext ?? null),
      sqlState: pgCode(exception),
      durationMs:
        typeof reply.elapsedTime === 'number'
          ? Math.round(reply.elapsedTime)
          : undefined,
    });

    if (resolved.status >= 500) {
      this.logger.error(
        line,
        exception instanceof Error ? exception.stack : undefined,
      );
      // Expected-noise 5xx thrown on purpose (HttpException) are still
      // reported: a 5xx is by definition something to look at.
      Sentry.withScope((scope) => {
        if (requestId) scope.setTag('request_id', requestId);
        scope.setTag('error_code', String(resolved.code));
        Sentry.captureException(exception);
      });
    } else {
      this.logger.warn(line);
    }
  }
}
