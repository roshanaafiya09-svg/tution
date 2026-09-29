import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { CronSecretGuard } from './cron-secret.guard';
import type { ConfigService } from '@nestjs/config';

function buildContext(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

function buildGuard(cronSecret: string | undefined) {
  const config = { get: () => cronSecret } as unknown as ConfigService;
  return new CronSecretGuard(config);
}

describe('CronSecretGuard', () => {
  it('is entirely unusable when CRON_SECRET is not configured — 503, not open', () => {
    const guard = buildGuard(undefined);
    expect(() =>
      guard.canActivate(buildContext({ 'x-cron-secret': 'anything' })),
    ).toThrow(ServiceUnavailableException);
  });

  it('rejects a missing header', () => {
    const guard = buildGuard('correct-secret-value');
    expect(() => guard.canActivate(buildContext({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a wrong secret', () => {
    const guard = buildGuard('correct-secret-value');
    expect(() =>
      guard.canActivate(buildContext({ 'x-cron-secret': 'wrong' })),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a secret of a different length (no length-based short circuit leak)', () => {
    const guard = buildGuard('correct-secret-value');
    expect(() =>
      guard.canActivate(buildContext({ 'x-cron-secret': 'short' })),
    ).toThrow(UnauthorizedException);
  });

  it('accepts the correct secret', () => {
    const guard = buildGuard('correct-secret-value');
    expect(
      guard.canActivate(
        buildContext({ 'x-cron-secret': 'correct-secret-value' }),
      ),
    ).toBe(true);
  });
});
