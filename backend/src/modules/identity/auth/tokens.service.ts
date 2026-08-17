import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { UserRole } from '../../../database/types';
import { RefreshTokenRepository } from './refresh-token.repository';

const ACCESS_TOKEN_TTL = '15m';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface AccessTokenPayload {
  sub: string;
  roles: UserRole[];
  /** Set only on Super Admin "view as user" tokens (see AdminService.impersonate).
   *  JwtAuthGuard rejects any non-GET request carrying this flag. */
  impersonation?: boolean;
  /** The Super Admin's own user id, carried alongside an impersonation
   *  token for traceability — who is really behind this session. */
  actorId?: string;
}

@Injectable()
export class TokensService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly refreshTokenRepository: RefreshTokenRepository,
  ) {}

  signAccessToken(userId: string, roles: UserRole[]): string {
    const payload: AccessTokenPayload = { sub: userId, roles };
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
  ): string {
    const payload: AccessTokenPayload = {
      sub: targetUserId,
      roles,
      impersonation: true,
      actorId,
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
  ): Promise<string> {
    const jti = randomUUID();
    await this.refreshTokenRepository.create(
      userId,
      jti,
      REFRESH_TOKEN_TTL_SECONDS,
      deviceLabel,
    );

    return this.jwtService.sign(
      { sub: userId, jti },
      {
        secret: this.config.getOrThrow<string>('auth.jwtRefreshSecret'),
        expiresIn: REFRESH_TOKEN_TTL_SECONDS,
      },
    );
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
  ): Promise<string> {
    await this.refreshTokenRepository.revoke(oldJti);
    return this.issueRefreshToken(userId, deviceLabel);
  }

  /** Account deletion (blueprint §4): every device is signed out immediately. */
  revokeAllSessions(userId: string): Promise<void> {
    return this.refreshTokenRepository.revokeAllForUser(userId);
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
