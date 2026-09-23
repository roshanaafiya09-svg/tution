/**
 * The API's machine-readable error vocabulary. Every error response carries
 * one of these in `code` so clients branch on a stable identifier — never on
 * message text, which is for people and may be reworded.
 *
 * Adding a code: add it here, throw it with
 * `new ForbiddenException({ code: ErrorCode.X, message: '…' })`, and add its
 * friendly copy to web/src/lib/api/messages.ts.
 */
export const ErrorCode = {
  // Generic, derived from the HTTP status when a thrower gave no code.
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNPROCESSABLE: 'UNPROCESSABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  BAD_GATEWAY: 'BAD_GATEWAY',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  GATEWAY_TIMEOUT: 'GATEWAY_TIMEOUT',
  /** A backing service (Postgres, Redis) dropped or refused the connection. */
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',

  // Individual / Academy teaching-context isolation.
  /** The X-Teaching-Context header was malformed. */
  TEACHING_CONTEXT_INVALID: 'TEACHING_CONTEXT_INVALID',
  /** The caller asked for an academy context they are not an active member of. */
  TEACHING_CONTEXT_FORBIDDEN: 'TEACHING_CONTEXT_FORBIDDEN',
  /** A record belongs to the other teaching context than the active one. */
  TEACHING_CONTEXT_MISMATCH: 'TEACHING_CONTEXT_MISMATCH',

  OTP_DELIVERY_FAILED: 'OTP_DELIVERY_FAILED',
  /** A wrong/expired/exhausted sign-in code — a 401 that is NOT an expired
   *  session, so clients must not try to refresh or redirect on it. */
  INVALID_OTP: 'INVALID_OTP',

  // Class session lifecycle guards (H2) — see SessionsService.cancel/complete.
  /** Cancel requested on a session that is already 'cancelled'. */
  SESSION_ALREADY_CANCELLED: 'SESSION_ALREADY_CANCELLED',
  /** Complete requested on a session that is already 'completed'. */
  SESSION_ALREADY_COMPLETED: 'SESSION_ALREADY_COMPLETED',
  /** Any other state change a session's current status forbids
   *  (completing a cancelled session, cancelling a completed one). */
  INVALID_SESSION_TRANSITION: 'INVALID_SESSION_TRANSITION',
  /** Cancel requested after the session's scheduled start time. */
  SESSION_ALREADY_STARTED: 'SESSION_ALREADY_STARTED',
  /** Complete requested before the session's scheduled start time. */
  SESSION_NOT_STARTED: 'SESSION_NOT_STARTED',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

const CODE_BY_STATUS: Record<number, ErrorCodeValue> = {
  400: ErrorCode.BAD_REQUEST,
  401: ErrorCode.UNAUTHENTICATED,
  402: ErrorCode.PAYMENT_REQUIRED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  413: ErrorCode.PAYLOAD_TOO_LARGE,
  422: ErrorCode.UNPROCESSABLE,
  429: ErrorCode.RATE_LIMITED,
  500: ErrorCode.INTERNAL_ERROR,
  502: ErrorCode.BAD_GATEWAY,
  503: ErrorCode.SERVICE_UNAVAILABLE,
  504: ErrorCode.GATEWAY_TIMEOUT,
};

export function defaultCodeForStatus(status: number): ErrorCodeValue {
  return (
    CODE_BY_STATUS[status] ??
    (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST)
  );
}

/**
 * Copy that is safe to show any user. Used whenever a thrower supplied no
 * message, only a framework default ("Unauthorized"), or — for 5xx — any
 * message at all, because a server-side failure's own message can name
 * tables, providers or config and must never reach the browser.
 */
const SAFE_MESSAGE_BY_STATUS: Record<number, string> = {
  400: 'The request could not be processed. Check the details and try again.',
  401: 'Your session has expired. Please sign in again.',
  402: 'This action needs an active subscription.',
  403: "You don't have permission to do that.",
  404: "We couldn't find what you were looking for.",
  409: 'That conflicts with the current state. Refresh and try again.',
  413: 'That upload is too large.',
  422: 'Some of the information provided is invalid.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'Something went wrong on our side. Please try again.',
  502: 'The service is temporarily unreachable. Please try again.',
  503: 'The service is temporarily unavailable. Please try again shortly.',
  504: 'The service took too long to respond. Please try again.',
};

export function safeMessageForStatus(status: number): string {
  return (
    SAFE_MESSAGE_BY_STATUS[status] ??
    (status >= 500 ? SAFE_MESSAGE_BY_STATUS[500] : SAFE_MESSAGE_BY_STATUS[400])
  );
}

/** Messages Nest/Passport/Fastify emit by default — they carry no
 *  information for a person, so they are replaced with the status copy. */
const FRAMEWORK_DEFAULT_MESSAGES = new Set([
  'bad request',
  'unauthorized',
  // Guard-internal wording for "you have no valid session".
  'missing bearer token',
  'invalid or expired access token',
  'forbidden',
  'forbidden resource',
  'not found',
  'conflict',
  'unprocessable entity',
  'payment required',
  'payload too large',
  'internal server error',
  'bad gateway',
  'service unavailable',
  'gateway timeout',
  'too many requests',
  'throttlerexception: too many requests',
]);

export function isFrameworkDefaultMessage(message: string): boolean {
  return FRAMEWORK_DEFAULT_MESSAGES.has(message.trim().toLowerCase());
}
