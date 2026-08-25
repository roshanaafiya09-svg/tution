import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthTokens } from './auth.service';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from './tokens.service';

/**
 * Shared by AuthController and DevAutoLoginController — every endpoint
 * that starts or renews a session needs to shape its response
 * identically for a given client type, so this lives in one place
 * rather than being duplicated per controller.
 *
 * Web clients (identified by the `X-Auth-Client: web` header the web
 * app always sends) get the refresh token as an httpOnly cookie and
 * never see it in the JSON body; mobile keeps the original body-in/
 * body-out `refreshToken` contract unchanged, forever — it never sends
 * the header and never sees a cookie.
 */
export const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_PATH = '/auth';

export function isWebClient(request: FastifyRequest): boolean {
  return request.headers['x-auth-client'] === 'web';
}

export function readRefreshToken(
  request: FastifyRequest,
  bodyToken: string | undefined,
): string | undefined {
  const cookies = request.cookies as Record<string, string> | undefined;
  return cookies?.[REFRESH_COOKIE_NAME] ?? bodyToken;
}

export interface WebSessionResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  csrfToken?: string;
}

/** `Secure`/`SameSite=None` are required for the cookie to survive a
 *  cross-site (web ↔ API, different domains) fetch in production, but
 *  `Secure` cookies are refused by browsers over plain `http://`
 *  localhost — hence the NODE_ENV branch, not a hardcoded choice. */
export function applyWebSession(
  reply: FastifyReply,
  tokens: AuthTokens,
  isWeb: boolean,
  nodeEnv: string | undefined,
): WebSessionResponse {
  if (!isWeb) {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  const isProd = nodeEnv === 'production';
  reply.setCookie(REFRESH_COOKIE_NAME, tokens.refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
  });

  return {
    accessToken: tokens.accessToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    csrfToken: tokens.csrfToken,
  };
}

export function clearWebSession(
  reply: FastifyReply,
  isWeb: boolean,
  nodeEnv: string | undefined,
): void {
  if (!isWeb) return;
  reply.clearCookie(REFRESH_COOKIE_NAME, {
    path: REFRESH_COOKIE_PATH,
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: nodeEnv === 'production' ? 'none' : 'lax',
  });
}
