import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { UserRole } from '../../../database/types';
import { RefreshTokenRepository } from './refresh-token.repository';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface AccessTokenPayload {
  sub: string;
  roles: UserRole[];
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

  /** Verifies the refresh JWT and that its jti is still active (not rotated/revoked). */
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
    if (!stored || stored.userId !== payload.sub) {
      throw new UnauthorizedException(
        'Refresh token has been revoked or rotated',
      );
    }

    return { userId: payload.sub, jti: payload.jti };
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
}
