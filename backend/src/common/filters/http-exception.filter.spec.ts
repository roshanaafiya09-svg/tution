/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access --
 * The filter's reply body is untyped JSON captured from a fake reply; asserting its shape IS the test. */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import { ErrorCode } from '../http/error-codes';
import { sanitizeRequestId } from '../http/request-id';

const REQUEST_ID = 'req-1234567890abcdef';

function run(exception: unknown, headers: Record<string, string> = {}) {
  let status = 0;
  let body: any;
  const reply = {
    elapsedTime: 12.4,
    status(code: number) {
      status = code;
      return this;
    },
    send(payload: unknown) {
      body = payload;
      return this;
    },
  };
  const request = {
    id: REQUEST_ID,
    method: 'GET',
    url: '/batches/me?token=SECRET',
    headers,
    user: { sub: 'user-1' },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => reply,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  new HttpExceptionFilter().catch(exception, host);
  return { status, body };
}

describe('HttpExceptionFilter — standard error envelope', () => {
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it('carries statusCode, code, message and requestId on every error', () => {
    const { status, body } = run(new NotFoundException('Batch not found'));
    expect(status).toBe(404);
    expect(body).toMatchObject({
      statusCode: 404,
      code: ErrorCode.NOT_FOUND,
      error: 'Not Found',
      message: 'Batch not found',
      requestId: REQUEST_ID,
    });
  });

  it('keeps a specific, human-written 4xx message', () => {
    const { body } = run(
      new ConflictException('This leave request has already been decided'),
    );
    expect(body.code).toBe(ErrorCode.CONFLICT);
    expect(body.message).toBe('This leave request has already been decided');
  });

  it('replaces framework-default messages with safe copy', () => {
    expect(run(new UnauthorizedException()).body).toMatchObject({
      code: ErrorCode.UNAUTHENTICATED,
      message: 'Your session has expired. Please sign in again.',
    });
    expect(run(new ForbiddenException()).body).toMatchObject({
      code: ErrorCode.FORBIDDEN,
      message: "You don't have permission to do that.",
    });
  });

  it('preserves an explicit machine-readable code (teaching-context isolation)', () => {
    const { status, body } = run(
      new ForbiddenException({
        code: ErrorCode.TEACHING_CONTEXT_MISMATCH,
        message:
          'This is an Academy batch. Switch to that academy profile to manage it.',
      }),
      { 'x-teaching-context': 'individual' },
    );
    expect(status).toBe(403);
    expect(body.code).toBe('TEACHING_CONTEXT_MISMATCH');
    expect(body.message).toMatch(/Switch to that academy profile/);
  });

  it('turns class-validator arrays into VALIDATION_FAILED + details, message stays a string', () => {
    const { status, body } = run(
      new BadRequestException([
        'capacity must be a positive number',
        'title should not be empty',
      ]),
    );
    expect(status).toBe(400);
    expect(body.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(body.details).toEqual([
      'capacity must be a positive number',
      'title should not be empty',
    ]);
    expect(typeof body.message).toBe('string');
    expect(body.message).toContain('capacity must be a positive number');
  });

  it('maps throttling to RATE_LIMITED with safe copy', () => {
    const { status, body } = run(
      new HttpException('ThrottlerException: Too Many Requests', 429),
    );
    expect(status).toBe(429);
    expect(body.code).toBe(ErrorCode.RATE_LIMITED);
    expect(body.message).toBe(
      'Too many requests. Please wait a moment and try again.',
    );
  });

  describe('server errors never leak internals', () => {
    it('an unhandled error is a 500 INTERNAL_ERROR with generic copy', () => {
      const { status, body } = run(
        new Error('relation "secret_table" does not exist'),
      );
      expect(status).toBe(500);
      expect(body.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(JSON.stringify(body)).not.toContain('secret_table');
      expect(body.requestId).toBe(REQUEST_ID);
    });

    it('a 5xx HttpException without a code hides its message', () => {
      const { body } = run(
        new InternalServerErrorException('Razorpay client not initialized'),
      );
      expect(JSON.stringify(body)).not.toContain('Razorpay');
      expect(body.message).toBe(
        'Something went wrong on our side. Please try again.',
      );
    });

    it('a 5xx HttpException the thrower vouched for (explicit code) keeps its message', () => {
      const { status, body } = run(
        new ServiceUnavailableException({
          code: ErrorCode.OTP_DELIVERY_FAILED,
          message: 'Could not send the code by email — try again shortly.',
        }),
      );
      expect(status).toBe(503);
      expect(body.code).toBe('OTP_DELIVERY_FAILED');
      expect(body.message).toBe(
        'Could not send the code by email — try again shortly.',
      );
    });

    it('a dropped database connection is a retryable 503, not an opaque 500', () => {
      const reset = Object.assign(new Error('read ECONNRESET'), {
        code: 'ECONNRESET',
      });
      const { status, body } = run(reset);
      expect(status).toBe(503);
      expect(body.code).toBe(ErrorCode.DEPENDENCY_UNAVAILABLE);
      expect(JSON.stringify(body)).not.toContain('ECONNRESET');
    });

    it('a Fastify 4xx (e.g. malformed JSON body) keeps its client status', () => {
      const parse = Object.assign(new Error('Unexpected token } in JSON'), {
        statusCode: 400,
        code: 'FST_ERR_CTP_INVALID_JSON_BODY',
      });
      const { status, body } = run(parse);
      expect(status).toBe(400);
      expect(body.code).toBe(ErrorCode.BAD_REQUEST);
      expect(JSON.stringify(body)).not.toContain('Unexpected token');
    });
  });

  // H10 — an uncaught Postgres constraint/trigger error is a clean typed
  // response, not an opaque 500, and never leaks SQL/constraint/table
  // names to the client (those stay in the server-side log only).
  describe('database constraint/trigger errors (H10)', () => {
    it('a unique violation (23505) is a 409, not a 500', () => {
      const dup = Object.assign(
        new Error(
          'duplicate key value violates unique constraint "fee_ledger_batch_id_student_id_period_label_key"',
        ),
        { code: '23505' },
      );
      const { status, body } = run(dup);
      expect(status).toBe(409);
      expect(body.code).toBe(ErrorCode.CONFLICT);
      expect(JSON.stringify(body)).not.toContain('fee_ledger');
      expect(JSON.stringify(body)).not.toContain('constraint');
    });

    it('a foreign-key violation (23503) is a 409, not a 500', () => {
      const fk = Object.assign(
        new Error(
          'insert or update on table "enrollments" violates foreign key constraint "enrollments_batch_id_fkey"',
        ),
        { code: '23503' },
      );
      const { status, body } = run(fk);
      expect(status).toBe(409);
      expect(body.code).toBe(ErrorCode.CONFLICT);
      expect(JSON.stringify(body)).not.toContain('enrollments');
    });

    it('an Academy-ownership immutability trigger firing (23514 check_violation) is a 409, not a 500', () => {
      // Mirrors what scholar_context_is_immutable()/batches_context_immutable
      // and friends raise (migration 0040) if a cross-context write ever
      // reaches the DB — app-level checks normally pre-empt this, but the
      // trigger is defense-in-depth and its failure must still be safe.
      const trigger = Object.assign(
        new Error('academy_id is immutable once a batch has sessions'),
        { code: '23514' },
      );
      const { status, body } = run(trigger);
      expect(status).toBe(409);
      expect(body.code).toBe(ErrorCode.CONFLICT);
      expect(JSON.stringify(body)).not.toContain('immutable');
    });

    it('a not-null violation (23502) is a 400, not a 500', () => {
      const notNull = Object.assign(
        new Error(
          'null value in column "tutor_id" violates not-null constraint',
        ),
        { code: '23502' },
      );
      const { status, body } = run(notNull);
      expect(status).toBe(400);
      expect(body.code).toBe(ErrorCode.BAD_REQUEST);
      expect(JSON.stringify(body)).not.toContain('tutor_id');
    });

    it('a plain RAISE EXCEPTION with no explicit SQLSTATE (P0001) is a 422, not a 500', () => {
      const raised = Object.assign(new Error('custom trigger rejection'), {
        code: 'P0001',
      });
      const { status, body } = run(raised);
      expect(status).toBe(422);
      expect(body.code).toBe(ErrorCode.UNPROCESSABLE);
    });

    it('still logs the real SQLSTATE and message server-side for a constraint violation', () => {
      const dup = Object.assign(
        new Error('duplicate key value violates unique constraint "x"'),
        {
          code: '23505',
        },
      );
      run(dup);
      expect(error).not.toHaveBeenCalled(); // 409 is caller-driven, not ours
      expect(warn).toHaveBeenCalledTimes(1);
      const line = JSON.parse(warn.mock.calls[0][0] as string);
      expect(line.sqlState).toBe('23505');
      expect(line.message).toContain('duplicate key');
    });
  });

  it('preserves extra keys a thrower attached (health check flags)', () => {
    const { status, body } = run(
      new ServiceUnavailableException({
        status: 'error',
        database: 'down',
        redis: 'up',
      }),
    );
    expect(status).toBe(503);
    expect(body).toMatchObject({
      status: 'error',
      database: 'down',
      redis: 'up',
      statusCode: 503,
    });
  });

  describe('structured logging', () => {
    it('logs the REAL error with requestId, caller and context at error level for 5xx', () => {
      run(new Error('relation "secret_table" does not exist'), {
        'x-teaching-context': 'academy:abc',
      });
      expect(error).toHaveBeenCalledTimes(1);
      const line = JSON.parse(error.mock.calls[0][0] as string);
      expect(line).toMatchObject({
        event: 'http_error',
        requestId: REQUEST_ID,
        method: 'GET',
        path: '/batches/me', // query string (tokens, PII) is never logged
        statusCode: 500,
        code: ErrorCode.INTERNAL_ERROR,
        userId: 'user-1',
        teachingContext: 'academy:abc',
      });
      expect(line.message).toContain('secret_table'); // real cause stays in the log
      expect(JSON.stringify(line)).not.toContain('SECRET');
    });

    it('logs 4xx at warn level, not error', () => {
      run(new ForbiddenException('nope'));
      expect(warn).toHaveBeenCalledTimes(1);
      expect(error).not.toHaveBeenCalled();
    });
  });
});

describe('request id sanitisation', () => {
  it('accepts a normal client-generated id', () => {
    expect(sanitizeRequestId('0b1f6c1e-7d34-4a55-9d0f-5f7b1a1c9c11')).toBe(
      '0b1f6c1e-7d34-4a55-9d0f-5f7b1a1c9c11',
    );
  });
  it('rejects ids that could forge log lines or headers', () => {
    expect(sanitizeRequestId('abc\nX-Injected: 1')).toBeNull();
    expect(sanitizeRequestId('short')).toBeNull();
    expect(sanitizeRequestId('x'.repeat(65))).toBeNull();
    expect(sanitizeRequestId('has space in it here')).toBeNull();
    expect(sanitizeRequestId(undefined)).toBeNull();
  });
});
