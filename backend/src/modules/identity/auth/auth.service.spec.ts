import { BadRequestException, ConflictException } from '@nestjs/common';

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
  findByIdentifier?: jest.Mock;
  requestOtp?: jest.Mock;
  checkOtp?: jest.Mock;
  updateEmail?: jest.Mock;
  consumeOtp?: jest.Mock;
  revokeAllSessions?: jest.Mock;
}) {
  const otpService = {
    requestOtp: overrides.requestOtp ?? jest.fn().mockResolvedValue(undefined),
    checkOtp: overrides.checkOtp ?? jest.fn().mockResolvedValue(undefined),
    consumeOtp: overrides.consumeOtp ?? jest.fn().mockResolvedValue(undefined),
  } as unknown as OtpService;

  const usersRepository = {
    findByEmail:
      overrides.findByEmail ?? jest.fn().mockResolvedValue(undefined),
    findByIdentifier:
      overrides.findByIdentifier ?? jest.fn().mockResolvedValue(undefined),
    updateEmail:
      overrides.updateEmail ?? jest.fn().mockResolvedValue(undefined),
  } as unknown as UsersRepository;

  const revokeAllSessions =
    overrides.revokeAllSessions ?? jest.fn().mockResolvedValue(undefined);
  const tokensService = { revokeAllSessions } as unknown as TokensService;

  const service = new AuthService(otpService, usersRepository, tokensService);
  return { service, otpService, usersRepository, revokeAllSessions };
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

  it('writes the email, consumes the OTP, and revokes every other session once verification passes', async () => {
    const checkOtp = jest.fn().mockResolvedValue(undefined);
    const updateEmail = jest.fn().mockResolvedValue(undefined);
    const consumeOtp = jest.fn().mockResolvedValue(undefined);
    const { service, revokeAllSessions } = buildService({
      checkOtp,
      updateEmail,
      consumeOtp,
    });

    await service.confirmEmailUpdate('me', 'Victim@Example.com', '123456');

    expect(checkOtp).toHaveBeenCalledWith('victim@example.com', '123456');
    expect(updateEmail).toHaveBeenCalledWith('me', 'victim@example.com');
    expect(consumeOtp).toHaveBeenCalledWith('victim@example.com');
    // A stolen access token used to reach this endpoint must not leave
    // an attacker's other sessions alive after the change.
    expect(revokeAllSessions).toHaveBeenCalledWith('me');
  });

  it('does not consume the OTP or revoke sessions if the email write fails (e.g. a race conflict)', async () => {
    const checkOtp = jest.fn().mockResolvedValue(undefined);
    const updateEmail = jest
      .fn()
      .mockRejectedValue(new ConflictException('already taken'));
    const consumeOtp = jest.fn();
    const { service, revokeAllSessions } = buildService({
      checkOtp,
      updateEmail,
      consumeOtp,
    });

    await expect(
      service.confirmEmailUpdate('me', 'victim@example.com', '123456'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(consumeOtp).not.toHaveBeenCalled();
    expect(revokeAllSessions).not.toHaveBeenCalled();
  });
});

/**
 * SEC-05: a phone identifier with no account, and a phone identifier
 * whose account has no email on file, must be indistinguishable to the
 * caller — both are "we can't send you a code" (400), never a
 * different status/message that would let someone probe which phone
 * numbers have real accounts. Email identifiers always get sent to
 * (accounts and non-accounts alike), so they were never enumerable.
 */
describe('AuthService.requestOtp — enumeration resistance (SEC-05)', () => {
  it('a non-existent phone number gets the exact same 400 as an existing-but-emailless account', async () => {
    const { service: serviceNoAccount } = buildService({
      findByIdentifier: jest.fn().mockResolvedValue(undefined),
    });
    const { service: serviceNoEmail } = buildService({
      findByIdentifier: jest.fn().mockResolvedValue({ id: 'u1', email: null }),
    });

    const [errNoAccount, errNoEmail] = await Promise.all([
      serviceNoAccount.requestOtp('+919876543210').catch((e: Error) => e),
      serviceNoEmail.requestOtp('+919876543211').catch((e: Error) => e),
    ]);

    expect(errNoAccount).toBeInstanceOf(BadRequestException);
    expect(errNoEmail).toBeInstanceOf(BadRequestException);
    expect((errNoAccount as BadRequestException).message).toBe(
      (errNoEmail as BadRequestException).message,
    );
    expect((errNoAccount as BadRequestException).getStatus()).toBe(
      (errNoEmail as BadRequestException).getStatus(),
    );
  });

  it('sends to an email identifier regardless of whether an account exists for it — never distinguishable', async () => {
    const requestOtp = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({
      findByIdentifier: jest.fn().mockResolvedValue(undefined),
      requestOtp,
    });

    await service.requestOtp('Nobody@Example.com');

    expect(requestOtp).toHaveBeenCalledWith('nobody@example.com', {
      email: 'nobody@example.com',
    });
  });

  it('sends to an existing phone-identified account with an email on file', async () => {
    const requestOtp = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService({
      findByIdentifier: jest
        .fn()
        .mockResolvedValue({ id: 'u1', email: 'real@example.com' }),
      requestOtp,
    });

    await service.requestOtp('+919876543210');

    expect(requestOtp).toHaveBeenCalledWith('+919876543210', {
      email: 'real@example.com',
    });
  });

  it('applies a delay before rejecting an unsendable identifier, closing most of the timing side channel', async () => {
    jest.useFakeTimers();
    try {
      const { service } = buildService({
        findByIdentifier: jest.fn().mockResolvedValue(undefined),
      });

      const promise = service
        .requestOtp('+919876543210')
        .catch((e: Error) => e);
      // Not resolved yet — the delay hasn't elapsed.
      let settled = false;
      void promise.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);

      await jest.advanceTimersByTimeAsync(400);
      const err = await promise;
      expect(err).toBeInstanceOf(BadRequestException);
    } finally {
      jest.useRealTimers();
    }
  });
});
