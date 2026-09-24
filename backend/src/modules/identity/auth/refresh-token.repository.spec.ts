import { RefreshTokenRepository } from './refresh-token.repository';
import type Redis from 'ioredis';

/**
 * Covers the tombstone-not-delete change behind the refresh-token
 * reuse/theft-detection fix (see tokens.service.spec.ts for the
 * detection logic itself): revoke() now marks a jti `revoked: true`
 * with KEEPTTL instead of deleting it outright, so a later replay of
 * that same jti can be told apart from "this jti never existed."
 */
function buildRepo(overrides: {
  get?: jest.Mock;
  set?: jest.Mock;
  srem?: jest.Mock;
}) {
  const get = overrides.get ?? jest.fn().mockResolvedValue(null);
  const set = overrides.set ?? jest.fn().mockResolvedValue('OK');
  const srem = overrides.srem ?? jest.fn().mockResolvedValue(1);
  const redis = { get, set, srem } as unknown as Redis;
  return { repo: new RefreshTokenRepository(redis), get, set, srem };
}

describe('RefreshTokenRepository.revoke', () => {
  it('tombstones (revoked: true, KEEPTTL) instead of deleting the key', async () => {
    const get = jest
      .fn()
      .mockResolvedValue(
        JSON.stringify({ userId: 'user-1', deviceLabel: 'phone' }),
      );
    const { repo, set, srem } = buildRepo({ get });

    await repo.revoke('jti-1');

    expect(set).toHaveBeenCalledWith(
      'refresh:token:jti-1',
      JSON.stringify({ userId: 'user-1', deviceLabel: 'phone', revoked: true }),
      'KEEPTTL',
    );
    expect(srem).toHaveBeenCalledWith('refresh:user:user-1', 'jti-1');
  });

  it('does nothing if the jti was already gone or never existed', async () => {
    const { repo, set, srem } = buildRepo({
      get: jest.fn().mockResolvedValue(null),
    });

    await repo.revoke('jti-missing');

    expect(set).not.toHaveBeenCalled();
    expect(srem).not.toHaveBeenCalled();
  });
});

describe('RefreshTokenRepository.findActiveByJti / findAnyByJti', () => {
  it('findActiveByJti returns null for a tombstoned entry — a rotated/revoked token stays rejected', async () => {
    const { repo } = buildRepo({
      get: jest
        .fn()
        .mockResolvedValue(JSON.stringify({ userId: 'user-1', revoked: true })),
    });

    await expect(repo.findActiveByJti('jti-1')).resolves.toBeNull();
  });

  it('findAnyByJti still returns a tombstoned entry — the one method allowed to see it, for reuse detection only', async () => {
    const { repo } = buildRepo({
      get: jest
        .fn()
        .mockResolvedValue(JSON.stringify({ userId: 'user-1', revoked: true })),
    });

    await expect(repo.findAnyByJti('jti-1')).resolves.toEqual({
      userId: 'user-1',
      revoked: true,
    });
  });

  it('findActiveByJti still returns a genuinely active entry unchanged', async () => {
    const { repo } = buildRepo({
      get: jest.fn().mockResolvedValue(JSON.stringify({ userId: 'user-1' })),
    });

    await expect(repo.findActiveByJti('jti-1')).resolves.toEqual({
      userId: 'user-1',
    });
  });

  it('both return null for a jti that was never issued', async () => {
    const { repo } = buildRepo({ get: jest.fn().mockResolvedValue(null) });

    await expect(repo.findActiveByJti('jti-1')).resolves.toBeNull();
    await expect(repo.findAnyByJti('jti-1')).resolves.toBeNull();
  });
});

// H8 — account deletion must invalidate an already-issued access token
// immediately, not just its refresh session. See markAccessRevoked's
// doc comment for why this is a plain Redis flag with no DB column.
describe('RefreshTokenRepository.markAccessRevoked / isAccessRevoked', () => {
  function buildRepoWithExists(overrides: {
    set?: jest.Mock;
    exists?: jest.Mock;
  }) {
    const set = overrides.set ?? jest.fn().mockResolvedValue('OK');
    const exists = overrides.exists ?? jest.fn().mockResolvedValue(0);
    const redis = { set, exists } as unknown as Redis;
    return { repo: new RefreshTokenRepository(redis), set, exists };
  }

  it('marks a user revoked with no TTL — a deleted account is never un-deleted', async () => {
    const { repo, set } = buildRepoWithExists({});
    await repo.markAccessRevoked('user-1');
    expect(set).toHaveBeenCalledWith('auth:access-revoked:user-1', '1');
    expect(set.mock.calls[0]).toHaveLength(2); // no EX/PX/KEEPTTL argument
  });

  it('isAccessRevoked is true only after markAccessRevoked, for that exact user', async () => {
    const { repo, exists } = buildRepoWithExists({
      exists: jest.fn().mockResolvedValue(1),
    });
    await expect(repo.isAccessRevoked('user-1')).resolves.toBe(true);
    expect(exists).toHaveBeenCalledWith('auth:access-revoked:user-1');
  });

  it('isAccessRevoked is false for a user who was never revoked', async () => {
    const { repo } = buildRepoWithExists({
      exists: jest.fn().mockResolvedValue(0),
    });
    await expect(repo.isAccessRevoked('user-2')).resolves.toBe(false);
  });
});
