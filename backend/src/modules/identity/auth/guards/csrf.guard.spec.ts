import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';
import type { TokensService } from '../tokens.service';

function buildContext(
  cookies: Record<string, string> | undefined,
  headers: Record<string, string>,
) {
  const request = { cookies, headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function buildGuard(overrides: {
  peekRefreshJti?: jest.Mock;
  verifyCsrfToken?: jest.Mock;
}) {
  const tokensService = {
    peekRefreshJti: overrides.peekRefreshJti ?? jest.fn(),
    verifyCsrfToken: overrides.verifyCsrfToken ?? jest.fn(),
  } as unknown as TokensService;
  return new CsrfGuard(tokensService);
}

describe('CsrfGuard', () => {
  it('passes through untouched when there is no refresh_token cookie (mobile path)', () => {
    const guard = buildGuard({});
    const context = buildContext(undefined, {});
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects an unparseable/expired-signature cookie before checking the header at all', () => {
    const guard = buildGuard({
      peekRefreshJti: jest.fn().mockReturnValue(null),
    });
    const context = buildContext({ refresh_token: 'garbage' }, {});
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects when the cookie is present but the CSRF header is missing', () => {
    const guard = buildGuard({
      peekRefreshJti: jest.fn().mockReturnValue('jti-1'),
      verifyCsrfToken: jest.fn().mockReturnValue(false),
    });
    const context = buildContext({ refresh_token: 'valid' }, {});
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects when the CSRF header does not match the cookie jti', () => {
    const verifyCsrfToken = jest.fn().mockReturnValue(false);
    const guard = buildGuard({
      peekRefreshJti: jest.fn().mockReturnValue('jti-1'),
      verifyCsrfToken,
    });
    const context = buildContext(
      { refresh_token: 'valid' },
      { 'x-csrf-token': 'wrong-token' },
    );
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(verifyCsrfToken).toHaveBeenCalledWith('jti-1', 'wrong-token');
  });

  it('allows the request through when the CSRF header matches the cookie jti', () => {
    const guard = buildGuard({
      peekRefreshJti: jest.fn().mockReturnValue('jti-1'),
      verifyCsrfToken: jest.fn().mockReturnValue(true),
    });
    const context = buildContext(
      { refresh_token: 'valid' },
      { 'x-csrf-token': 'correct-token' },
    );
    expect(guard.canActivate(context)).toBe(true);
  });
});
