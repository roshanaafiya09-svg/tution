import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { UserRole } from '../../../database/types';
import {
  RefreshTokenRepository,
  type CachedAuthState,
} from './refresh-token.repository';
import { UsersRepository } from '../users/users.repository';

const ACCESS_TOKEN_TTL = '15m';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
/** How long a user's token_version may be served from Redis before the
 *  guard re-reads the database. Account deletion overwrites the cached
 *  value immediately; this TTL only bounds how stale it could get if that
 *  overwrite itself failed while Redis kept serving reads. */
export const AUTH_STATE_CACHE_TTL_SECONDS = 60;

export interface IssuedRefreshToken {
  token: string;
  jti: string;
}

export interface AccessTokenPayload {
  sub: string;
  roles: UserRole[];
  /** Set only on Super Admin "view as user" tokens (see AdminService.impersonate).
   *  JwtAuthGuard rejects any non-GET request carrying this flag. */
  impersonation?: boolean;
  /** The Super Admin's own user id, carried alongside an impersonation
   *  token for traceability — who is really behind this session. */
  actorId?: string;
  /** H8: users.token_version at issue time. A token whose version no
   *  longer matches the account's current one is rejected. Tokens issued
   *  before this claim existed carry none and are treated as version 0
   *  (every account's starting version), so they keep working until
   *  their normal ≤15-minute expiry unless the account is deleted. */
  tv?: number;
}

@Injectable()
export class TokensService {
  private readonly logger = new Logger(TokensService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly usersRepository: UsersRepository,
  ) {}

  signAccessToken(userId: string, roles: UserRole[], tokenVersion = 0): string {
    const payload: AccessTokenPayload = {
      sub: userId,
      roles,
      tv: tokenVersion,
    };
    return this.jwtService.sign(payload, {
      secret: this.config.getOrThrow<string>('auth.jwtAccessSecret'),
      expiresIn: ACCESS_TOKEN_TTL,
    });
  }

  /** Super Admin "view as user" (AdminService.impersonate): an access
   *  token scoped to the target user's own sub/roles so every existing
   *  "whose data is this" endpoint works unmodified, but flagged
   *  `impersonation: true` so JwtAuthGuard rejects any write with it.
   *  Deliberately has no matching refresh token — the session is meant
   *  to end when this 15-minute token expires, not be renewed forever. */
  signImpersonationToken(
    targetUserId: string,
    roles: UserRole[],
    actorId: string,
    tokenVersion = 0,
  ): string {
    const payload: AccessTokenPayload = {
      sub: targetUserId,
      roles,
      impersonation: true,
      actorId,
      tv: tokenVersion,
    };
    return this.jwtService.sign(payload, {
      secret: this.config.getOrThrow<string>('auth.jwtAccessSecret'),
      expiresIn: ACCESS_TOKEN_TTL,
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwtService.verify<AccessTokenPayload>(token, {
      secret: this.config.getOrThrow<string>('auth.jwtAccessSecret'),
    });
  }

  async issueRefreshToken(
    userId: string,
    deviceLabel?: string,
  ): Promise<IssuedRefreshToken> {
    const jti = randomUUID();
    await this.refreshTokenRepository.create(
      userId,
      jti,
      REFRESH_TOKEN_TTL_SECONDS,
      deviceLabel,
    );

    const token = this.jwtService.sign(
      { sub: userId, jti },
      {
        secret: this.config.getOrThrow<string>('auth.jwtRefreshSecret'),
        expiresIn: REFRESH_TOKEN_TTL_SECONDS,
      },
    );
    return { token, jti };
  }

  /** Signature/expiry-tolerant decode only — no Redis lookup, no
   *  rotation/revocation check. Used by CsrfGuard to cheaply recover a
   *  cookie-borne refresh token's jti before the real verifyRefreshToken
   *  runs deeper in the request. `ignoreExpiration` is deliberate: a
   *  request bearing an expired-but-signature-valid cookie should still
   *  have its CSRF header checked (and rejected for mismatch) rather
   *  than skip straight to whatever expiry error the real verify below
   *  would throw — CSRF and "is this session still valid" are separate
   *  questions. */
  peekRefreshJti(token: string): string | null {
    try {
      const payload = this.jwtService.verify<{ sub: string; jti: string }>(
        token,
        {
          secret: this.config.getOrThrow<string>('auth.jwtRefreshSecret'),
          ignoreExpiration: true,
        },
      );
      return payload.jti;
    } catch {
      return null;
    }
  }

  /** Stateless HMAC of a refresh token's jti — the CSRF synchronizer
   *  token handed to the web client once (in the login/refresh JSON
   *  body) and echoed back as X-CSRF-Token on /auth/refresh and
   *  /auth/logout. Deliberately not stored anywhere: it's fully
   *  recomputable from the jti + server secret, so there's nothing to
   *  invalidate on rotation beyond the jti itself already changing. */
  signCsrfToken(jti: string): string {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('auth.csrfSecret'),
    )
      .update(jti)
      .digest('hex');
  }

  verifyCsrfToken(jti: string, candidate: string): boolean {
    const expected = Buffer.from(this.signCsrfToken(jti), 'hex');
    let candidateBuf: Buffer;
    try {
      candidateBuf = Buffer.from(candidate, 'hex');
    } catch {
      return false;
    }
    if (expected.length !== candidateBuf.length) return false;
    return timingSafeEqual(expected, candidateBuf);
  }

  /** Verifies the refresh JWT and that its jti is still active (not
   *  rotated/revoked). A jti that's inactive but tombstoned as
   *  belonging to this exact user is the textbook signal a refresh
   *  token was stolen — rotation makes each one single-use, so seeing
   *  an already-rotated one presented again means someone other than
   *  whoever legitimately rotated it is also holding it. That's treated
   *  as a compromise: every session for this user is revoked
   *  immediately rather than just rejecting this one request, forcing a
   *  genuine re-login everywhere instead of leaving the thief's
   *  already-obtained session live. */
  async verifyRefreshToken(
    token: string,
  ): Promise<{ userId: string; jti: string }> {
    let payload: { sub: string; jti: string };
    try {
      payload = this.jwtService.verify<{ sub: string; jti: string }>(token, {
        secret: this.config.getOrThrow<string>('auth.jwtRefreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const stored = await this.refreshTokenRepository.findActiveByJti(
      payload.jti,
    );
    if (stored && stored.userId === payload.sub) {
      return { userId: payload.sub, jti: payload.jti };
    }

    const tombstoned = await this.refreshTokenRepository.findAnyByJti(
      payload.jti,
    );
    if (tombstoned?.revoked && tombstoned.userId === payload.sub) {
      await this.refreshTokenRepository.revokeAllForUser(payload.sub);
    }

    throw new UnauthorizedException(
      'Refresh token has been revoked or rotated',
    );
  }

  /** Rotation: the old jti is revoked and a fresh refresh token issued. */
  async rotateRefreshToken(
    oldJti: string,
    userId: string,
    deviceLabel?: string,
  ): Promise<IssuedRefreshToken> {
    await this.refreshTokenRepository.revoke(oldJti);
    return this.issueRefreshToken(userId, deviceLabel);
  }

  /** Account deletion (blueprint §4): every device is signed out immediately. */
  revokeAllSessions(userId: string): Promise<void> {
    return this.refreshTokenRepository.revokeAllForUser(userId);
  }

  /** H8: the account's CURRENT token version — what a newly issued
   *  access token must carry. */
  async currentTokenVersion(userId: string): Promise<number> {
    const row = await this.usersRepository.findAuthState(userId);
    return row?.token_version ?? 0;
  }

  /**
   * H8: called right after the durable change (UsersRepository.softDelete
   * already bumped token_version in the database — that alone is what
   * invalidates the old tokens). This only refreshes the cache so the
   * very next request sees the new state instead of waiting out the
   * cached entry. Best-effort: if Redis is unavailable, reads fall back to
   * the database anyway.
   */
  async revokeAccessTokens(userId: string): Promise<void> {
    try {
      const state = await this.loadAuthState(userId);
      if (state) {
        await this.refreshTokenRepository.cacheAuthState(
          userId,
          state,
          AUTH_STATE_CACHE_TTL_SECONDS,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Could not refresh cached auth state for ${userId}; the database remains authoritative: ${String(err)}`,
      );
    }
  }

  /**
   * Checked by JwtAuthGuard on every request, after the JWT's own
   * signature/expiry passes — the one place an already-issued access
   * token can be killed before its natural 15-minute expiry. Valid only
   * if the account still exists, is not deleted, and its token_version
   * is the one the token was issued under.
   *
   * Source of truth is users.token_version / users.deleted_at. Redis
   * caches it for AUTH_STATE_CACHE_TTL_SECONDS so a normal request costs
   * one Redis GET, not a database query; a cache miss or a Redis failure
   * reads the database — so losing Redis can make this slower, never
   * more permissive.
   */
  async isAccessTokenCurrent(payload: AccessTokenPayload): Promise<boolean> {
    let state: CachedAuthState | null = null;
    try {
      state = await this.refreshTokenRepository.getCachedAuthState(payload.sub);
    } catch {
      state = null; // Redis unavailable — fall through to the database
    }
    if (!state) {
      state = await this.loadAuthState(payload.sub);
      if (state) {
        try {
          await this.refreshTokenRepository.cacheAuthState(
            payload.sub,
            state,
            AUTH_STATE_CACHE_TTL_SECONDS,
          );
        } catch {
          // Caching is an optimisation only.
        }
      }
    }
    if (!state || state.deleted) return false;
    return (payload.tv ?? 0) === state.version;
  }

  private async loadAuthState(userId: string): Promise<CachedAuthState | null> {
    const row = await this.usersRepository.findAuthState(userId);
    if (!row) return null;
    return { version: row.token_version, deleted: row.deleted_at !== null };
  }

  /** Single-device sign-out: revokes only this refresh token's session,
   *  leaving the caller's other devices logged in. Tolerant of an
   *  already-invalid/expired token — the caller's goal ("I'm logged
   *  out") is already satisfied in that case, so this never throws. */
  async revokeSession(refreshToken: string): Promise<void> {
    try {
      const { jti } = await this.verifyRefreshToken(refreshToken);
      await this.refreshTokenRepository.revoke(jti);
    } catch {
      // Already invalid, expired, or previously revoked — nothing to do.
    }
  }
}
