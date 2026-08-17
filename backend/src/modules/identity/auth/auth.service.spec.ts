import { ConflictException } from '@nestjs/common';

// AuthService imports UsersRepository, which imports database.module.ts —
// that pulls in Kysely's real (ESM) package at the top level for its
// Postgres pool setup, which this Jest config can't transform (see
// users.repository.spec.ts for the same workaround). The test never
// touches Nest's DI container (AuthService is constructed directly
// below with mocked dependencies), so the token's actual value doesn't
// matter; only importing it without crashing does.
jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));

import { AuthService } from './auth.service';
import type { OtpService } from '../otp/otp.service';
import type { UsersRepository } from '../users/users.repository';
import type { TokensService } from './tokens.service';

/**
 * Covers the account-hijack fix for POST /auth/contact: a signed-in
 * user must prove control of a new email (via the same OTP
 * challenge/consume mechanism as login) before it's ever written to
 * users.email. See AuthService.requestEmailUpdate/confirmEmailUpdate.
 */
function buildService(overrides: {
  findByEmail?: jest.Mock;
  requestOtp?: jest.Mock;
  checkOtp?: jest.Mock;
  updateEmail?: jest.Mock;
  consumeOtp?: jest.Mock;
}) {
  const otpService = {
    requestOtp: overrides.requestOtp ?? jest.fn().mockResolvedValue(undefined),
    checkOtp: overrides.checkOtp ?? jest.fn().mockResolvedValue(undefined),
    consumeOtp: overrides.consumeOtp ?? jest.fn().mockResolvedValue(undefined),
  } as unknown as OtpService;

  const usersRepository = {
    findByEmail:
      overrides.findByEmail ?? jest.fn().mockResolvedValue(undefined),
    updateEmail:
      overrides.updateEmail ?? jest.fn().mockResolvedValue(undefined),
  } as unknown as UsersRepository;

  const tokensService = {} as unknown as TokensService;

  const service = new AuthService(otpService, usersRepository, tokensService);
  return { service, otpService, usersRepository };
}

describe('AuthService.requestEmailUpdate', () => {
  it('rejects an email already claimed by a different account, before sending any OTP', async () => {
    const findByEmail = jest.fn().mockResolvedValue({ id: 'other-user' });
    const requestOtp = jest.fn();
    const { service } = buildService({ findByEmail, requestOtp });

    await expect(
      service.requestEmailUpdate('me', 'victim@example.com'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(requestOtp).not.toHaveBeenCalled();
  });

  it('allows re-requesting for an email the caller already owns', async () => {
    const findByEmail = jest.fn().mockResolvedValue({ id: 'me' });
    const requestOtp = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({ findByEmail, requestOtp });

    await service.requestEmailUpdate('me', 'me@example.com');

    expect(requestOtp).toHaveBeenCalledWith('me@example.com', {
      email: 'me@example.com',
    });
  });

  it('sends an OTP to a genuinely unclaimed email, normalized to lowercase', async () => {
    const findByEmail = jest.fn().mockResolvedValue(undefined);
    const requestOtp = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({ findByEmail, requestOtp });

    await service.requestEmailUpdate('me', 'New@Example.com');

    expect(findByEmail).toHaveBeenCalledWith('new@example.com');
    expect(requestOtp).toHaveBeenCalledWith('new@example.com', {
      email: 'new@example.com',
    });
  });
});

describe('AuthService.confirmEmailUpdate', () => {
  it('never writes the new email unless the OTP check passes — this is the fix: a client cannot claim an email without proving control of it', async () => {
    const checkOtp = jest.fn().mockRejectedValue(new Error('bad code'));
    const updateEmail = jest.fn();
    const { service } = buildService({ checkOtp, updateEmail });

    await expect(
      service.confirmEmailUpdate('me', 'victim@example.com', '000000'),
    ).rejects.toThrow('bad code');
    expect(updateEmail).not.toHaveBeenCalled();
  });

  it('writes the email and consumes the OTP once verification passes', async () => {
    const checkOtp = jest.fn().mockResolvedValue(undefined);
    const updateEmail = jest.fn().mockResolvedValue(undefined);
    const consumeOtp = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({ checkOtp, updateEmail, consumeOtp });

    await service.confirmEmailUpdate('me', 'Victim@Example.com', '123456');

    expect(checkOtp).toHaveBeenCalledWith('victim@example.com', '123456');
    expect(updateEmail).toHaveBeenCalledWith('me', 'victim@example.com');
    expect(consumeOtp).toHaveBeenCalledWith('victim@example.com');
  });

  it('does not consume the OTP if the email write fails (e.g. a race conflict)', async () => {
    const checkOtp = jest.fn().mockResolvedValue(undefined);
    const updateEmail = jest
      .fn()
      .mockRejectedValue(new ConflictException('already taken'));
    const consumeOtp = jest.fn();
    const { service } = buildService({ checkOtp, updateEmail, consumeOtp });

    await expect(
      service.confirmEmailUpdate('me', 'victim@example.com', '123456'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(consumeOtp).not.toHaveBeenCalled();
  });
});
