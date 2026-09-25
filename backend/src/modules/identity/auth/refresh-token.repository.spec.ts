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

// H8 — the Redis entry is only a CACHE of users.token_version / deleted
// (see TokensService.isAccessTokenCurrent for the source of truth).
describe('RefreshTokenRepository auth-state cache', () => {
  function buildRepo(overrides: { set?: jest.Mock; get?: jest.Mock }) {
    const set = overrides.set ?? jest.fn().mockResolvedValue('OK');
    const get = overrides.get ?? jest.fn().mockResolvedValue(null);
    const redis = { set, get } as unknown as Redis;
    return { repo: new RefreshTokenRepository(redis), set, get };
  }

  it('caches with a TTL — it is never the only record of a revocation', async () => {
    const { repo, set } = buildRepo({});
    await repo.cacheAuthState('user-1', { version: 3, deleted: true }, 60);
    expect(set).toHaveBeenCalledWith(
      'auth:state:user-1',
      JSON.stringify({ version: 3, deleted: true }),
      'EX',
      60,
    );
  });

  it('reads back what was cached, for that exact user', async () => {
    const { repo, get } = buildRepo({
      get: jest
        .fn()
        .mockResolvedValue(JSON.stringify({ version: 2, deleted: false })),
    });
    await expect(repo.getCachedAuthState('user-1')).resolves.toEqual({
      version: 2,
      deleted: false,
    });
    expect(get).toHaveBeenCalledWith('auth:state:user-1');
  });

  it('a missing or malformed entry is a cache miss, not a verdict', async () => {
    await expect(
      buildRepo({}).repo.getCachedAuthState('user-2'),
    ).resolves.toBeNull();
    await expect(
      buildRepo({
        get: jest.fn().mockResolvedValue(JSON.stringify({ deleted: true })),
      }).repo.getCachedAuthState('user-2'),
    ).resolves.toBeNull();
  });
});
