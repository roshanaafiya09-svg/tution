import { NotFoundException, UnauthorizedException } from '@nestjs/common';

// GoogleAuthService imports UsersRepository, which imports
// database.module.ts — that pulls in Kysely's real (ESM) package at the
// top level, which this Jest config can't transform (see
// auth.service.spec.ts / users.repository.spec.ts for the same
// workaround). The test never touches Nest's DI container
// (GoogleAuthService is constructed directly below with mocked
// dependencies), so only importing it without crashing matters here.
jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));

// GoogleAuthService constructs a real OAuth2Client in its constructor —
// mock the whole module so verifyIdToken's return value is controllable
// per test without a real Google round-trip.
const verifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken })),
}));

import { GoogleAuthService } from './google-auth.service';
import type { ConfigService } from '@nestjs/config';
import type { UsersRepository } from '../users/users.repository';
import type { TokensService } from './tokens.service';

/**
 * SEC-09: verifyIdToken only proved the token was genuinely issued by
 * Google for our client ID — it never checked whether Google itself
 * considers the embedded email address verified. An account can hold a
 * valid ID token for an email it hasn't confirmed (e.g. an unverified
 * Workspace domain), which would previously sign straight into whatever
 * app account already has that address on file.
 */
function buildService(overrides: {
  findByEmail?: jest.Mock;
  getRoles?: jest.Mock;
}) {
  const config = {
    get: jest.fn().mockReturnValue('test-client-id'),
  } as unknown as ConfigService;

  const findByEmail = overrides.findByEmail ?? jest.fn();
  const getRoles =
    overrides.getRoles ?? jest.fn().mockResolvedValue(['student']);
  const usersRepository = {
    findByEmail,
    getRoles,
  } as unknown as UsersRepository;

  const tokensService = {
    signAccessToken: jest.fn().mockReturnValue('access-token'),
    issueRefreshToken: jest
      .fn()
      .mockResolvedValue({ token: 'refresh-token', jti: 'jti-1' }),
    signCsrfToken: jest.fn().mockReturnValue('csrf-token'),
  } as unknown as TokensService;

  const service = new GoogleAuthService(config, usersRepository, tokensService);
  return { service, findByEmail };
}

describe('GoogleAuthService.signIn — email_verified enforcement (SEC-09)', () => {
  it('rejects an ID token whose email Google has not verified', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'user@example.com', email_verified: false }),
    });
    const { service } = buildService({});

    await expect(service.signIn('idtoken')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an ID token with no email_verified claim at all', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'user@example.com' }),
    });
    const { service } = buildService({});

    await expect(service.signIn('idtoken')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts a verified email and issues a full token set for the linked account', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'user@example.com', email_verified: true }),
    });
    const findByEmail = jest.fn().mockResolvedValue({ id: 'user-1' });
    const { service } = buildService({ findByEmail });

    const tokens = await service.signIn('idtoken');

    expect(tokens).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      csrfToken: 'csrf-token',
    });
    expect(findByEmail).toHaveBeenCalledWith('user@example.com');
  });

  it('rejects when no account is linked to the (verified) email at all', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'user@example.com', email_verified: true }),
    });
    const { service } = buildService({
      findByEmail: jest.fn().mockResolvedValue(undefined),
    });

    await expect(service.signIn('idtoken')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
