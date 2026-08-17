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
