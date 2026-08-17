import { UnauthorizedException } from '@nestjs/common';
import { TokensService } from './tokens.service';
import type { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import type { RefreshTokenRepository } from './refresh-token.repository';

/**
 * Covers the refresh-token reuse/theft-detection fix: a jti that's
 * inactive but tombstoned as belonging to the presenting user (i.e.
 * legitimately rotated moments ago and now being replayed) triggers a
 * full session wipe for that user, instead of just a plain 401 that
 * leaves whoever's holding the stolen token free to keep using their
 * already-obtained session.
 */
function buildService(overrides: {
  verify?: jest.Mock;
  findActiveByJti?: jest.Mock;
  findAnyByJti?: jest.Mock;
  revokeAllForUser?: jest.Mock;
}) {
  const verify = overrides.verify ?? jest.fn();
  const jwtService = { verify, sign: jest.fn() } as unknown as JwtService;
  const config = { getOrThrow: () => 'secret' } as unknown as ConfigService;
  const findActiveByJti = overrides.findActiveByJti ?? jest.fn();
  const findAnyByJti = overrides.findAnyByJti ?? jest.fn();
  const revokeAllForUser =
    overrides.revokeAllForUser ?? jest.fn().mockResolvedValue(undefined);
  const refreshTokenRepository = {
    findActiveByJti,
    findAnyByJti,
    revokeAllForUser,
  } as unknown as RefreshTokenRepository;

  const service = new TokensService(jwtService, config, refreshTokenRepository);
  return { service, verify, findActiveByJti, findAnyByJti, revokeAllForUser };
}

describe('TokensService.verifyRefreshToken', () => {
  it('accepts an active, matching jti normally, without touching reuse detection', async () => {
    const { service, revokeAllForUser } = buildService({
      verify: jest.fn().mockReturnValue({ sub: 'user-1', jti: 'jti-1' }),
      findActiveByJti: jest.fn().mockResolvedValue({ userId: 'user-1' }),
    });

    await expect(service.verifyRefreshToken('token')).resolves.toEqual({
      userId: 'user-1',
      jti: 'jti-1',
    });
    expect(revokeAllForUser).not.toHaveBeenCalled();
  });

  it('revokes every session for the user when an already-rotated jti is replayed — the theft-detection fix', async () => {
    const { service, revokeAllForUser } = buildService({
      verify: jest.fn().mockReturnValue({ sub: 'user-1', jti: 'jti-old' }),
      findActiveByJti: jest.fn().mockResolvedValue(null),
      findAnyByJti: jest
        .fn()
        .mockResolvedValue({ userId: 'user-1', revoked: true }),
    });

    await expect(service.verifyRefreshToken('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(revokeAllForUser).toHaveBeenCalledWith('user-1');
    expect(revokeAllForUser).toHaveBeenCalledTimes(1);
  });

  it('does NOT trigger reuse detection for a jti that never existed at all', async () => {
    const { service, revokeAllForUser } = buildService({
      verify: jest.fn().mockReturnValue({ sub: 'user-1', jti: 'jti-unknown' }),
      findActiveByJti: jest.fn().mockResolvedValue(null),
      findAnyByJti: jest.fn().mockResolvedValue(null),
    });

    await expect(service.verifyRefreshToken('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(revokeAllForUser).not.toHaveBeenCalled();
  });

  it('does NOT trigger reuse detection for a tombstoned jti belonging to a different user', async () => {
    const { service, revokeAllForUser } = buildService({
      verify: jest.fn().mockReturnValue({ sub: 'user-1', jti: 'jti-old' }),
      findActiveByJti: jest.fn().mockResolvedValue(null),
      findAnyByJti: jest
        .fn()
        .mockResolvedValue({ userId: 'someone-else', revoked: true }),
    });

    await expect(service.verifyRefreshToken('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(revokeAllForUser).not.toHaveBeenCalled();
  });

  it('rejects an invalid/expired JWT before ever touching the repository', async () => {
    const { service, findActiveByJti } = buildService({
      verify: jest.fn().mockImplementation(() => {
        throw new Error('bad jwt');
      }),
    });

    await expect(service.verifyRefreshToken('garbage')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(findActiveByJti).not.toHaveBeenCalled();
  });

  it('rejects when the active record belongs to a different user than the JWT claims', async () => {
    const { service, revokeAllForUser } = buildService({
      verify: jest.fn().mockReturnValue({ sub: 'user-1', jti: 'jti-1' }),
      findActiveByJti: jest.fn().mockResolvedValue({ userId: 'someone-else' }),
      findAnyByJti: jest.fn().mockResolvedValue({ userId: 'someone-else' }),
    });

    await expect(service.verifyRefreshToken('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(revokeAllForUser).not.toHaveBeenCalled();
  });
});
