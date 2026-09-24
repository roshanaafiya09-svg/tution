import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { TokensService } from '../tokens.service';

/**
 * H8 — a deleted account's already-issued access token must be rejected
 * immediately (TokensService.isAccessRevoked), not just once it
 * naturally expires. Covers the guard's new second check, run only
 * after the JWT's own signature/expiry already passed.
 */
function buildContext(authorization?: string) {
  const request: Record<string, unknown> = authorization
    ? { headers: { authorization }, method: 'GET' }
    : { headers: {}, method: 'GET' };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('JwtAuthGuard.canActivate', () => {
  it('allows a valid, non-revoked token through and attaches the user', async () => {
    const verifyAccessToken = jest
      .fn()
      .mockReturnValue({ sub: 'user-1', roles: ['tutor'] });
    const isAccessRevoked = jest.fn().mockResolvedValue(false);
    const tokensService = {
      verifyAccessToken,
      isAccessRevoked,
    } as unknown as TokensService;
    const guard = new JwtAuthGuard(tokensService);
    const { context, request } = buildContext('Bearer good-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(isAccessRevoked).toHaveBeenCalledWith('user-1');
    expect((request as { user?: unknown }).user).toEqual({
      sub: 'user-1',
      roles: ['tutor'],
    });
  });

  it('rejects a signature-valid token belonging to a deleted account', async () => {
    const verifyAccessToken = jest
      .fn()
      .mockReturnValue({ sub: 'deleted-user', roles: ['tutor'] });
    const isAccessRevoked = jest.fn().mockResolvedValue(true);
    const tokensService = {
      verifyAccessToken,
      isAccessRevoked,
    } as unknown as TokensService;
    const guard = new JwtAuthGuard(tokensService);
    const { context } = buildContext('Bearer stale-token');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('never checks revocation for a token that fails signature/expiry verification', async () => {
    const verifyAccessToken = jest.fn().mockImplementation(() => {
      throw new Error('expired');
    });
    const isAccessRevoked = jest.fn();
    const tokensService = {
      verifyAccessToken,
      isAccessRevoked,
    } as unknown as TokensService;
    const guard = new JwtAuthGuard(tokensService);
    const { context } = buildContext('Bearer bad-token');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(isAccessRevoked).not.toHaveBeenCalled();
  });

  it('rejects a request with no bearer token before touching either check', async () => {
    const verifyAccessToken = jest.fn();
    const isAccessRevoked = jest.fn();
    const tokensService = {
      verifyAccessToken,
      isAccessRevoked,
    } as unknown as TokensService;
    const guard = new JwtAuthGuard(tokensService);
    const { context } = buildContext();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(isAccessRevoked).not.toHaveBeenCalled();
  });
});
