// AdminService imports UsersRepository, which imports database.module.ts
// — that pulls in Kysely's real (ESM) package at the top level for its
// Postgres pool setup, which this Jest config can't transform (see
// users.repository.spec.ts for the same workaround). The test never
// touches Nest's DI container (AdminService is constructed directly
// below with mocked dependencies), so the token's actual value doesn't
// matter; only importing it without crashing does.
jest.mock('../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));

import { ForbiddenException } from '@nestjs/common';
import { AdminService } from './admin.service';
import type { AdminRepository } from './admin.repository';
import type { UsersRepository } from '../identity/users/users.repository';
import type { TokensService } from '../identity/auth/tokens.service';
import type { AuditLogService } from '../trust/audit/audit-log.service';

/**
 * Covers the admin audit-logging fix: impersonation and account
 * deletion are the two highest-privilege actions a Super Admin can take
 * and previously left zero trace anywhere. See AdminService.impersonate
 * / deleteUser.
 */
function buildService(overrides: {
  findById?: jest.Mock;
  getRoles?: jest.Mock;
  signImpersonationToken?: jest.Mock;
  findDisplayName?: jest.Mock;
  revokeAllSessions?: jest.Mock;
  hardDelete?: jest.Mock;
  record?: jest.Mock;
}) {
  const findById = overrides.findById ?? jest.fn();
  const getRoles = overrides.getRoles ?? jest.fn().mockResolvedValue([]);
  const signImpersonationToken =
    overrides.signImpersonationToken ?? jest.fn().mockReturnValue('token');
  const findDisplayName =
    overrides.findDisplayName ?? jest.fn().mockResolvedValue('Some Name');
  const revokeAllSessions =
    overrides.revokeAllSessions ?? jest.fn().mockResolvedValue(undefined);
  const hardDelete =
    overrides.hardDelete ?? jest.fn().mockResolvedValue(undefined);
  const record = overrides.record ?? jest.fn().mockResolvedValue(undefined);

  const adminRepository = {
    findDisplayName,
  } as unknown as AdminRepository;
  const usersRepository = {
    findById,
    getRoles,
    hardDelete,
  } as unknown as UsersRepository;
  const tokensService = {
    signImpersonationToken,
    revokeAllSessions,
  } as unknown as TokensService;
  const auditLog = { record } as unknown as AuditLogService;

  const service = new AdminService(
    adminRepository,
    usersRepository,
    tokensService,
    auditLog,
  );

  return {
    service,
    findById,
    getRoles,
    signImpersonationToken,
    revokeAllSessions,
    hardDelete,
    record,
  };
}

describe('AdminService.impersonate', () => {
  it('writes an audit-log entry recording who impersonated whom, as which role', async () => {
    const { service, record } = buildService({
      findById: jest.fn().mockResolvedValue({
        id: 'target-1',
        email: 'a@b.com',
        phone_e164: '+1',
      }),
      getRoles: jest.fn().mockResolvedValue(['student']),
    });

    await service.impersonate('admin-1', 'target-1');

    expect(record).toHaveBeenCalledWith({
      actorId: 'admin-1',
      actorRole: 'superadmin',
      action: 'admin.impersonate',
      entity: 'users',
      entityId: 'target-1',
      diff: { viewedAsRole: 'student' },
    });
  });

  it('does not log anything if the target is a superadmin (blocked before the audit-log call)', async () => {
    const { service, record } = buildService({
      findById: jest.fn().mockResolvedValue({ id: 'target-1' }),
      getRoles: jest.fn().mockResolvedValue(['superadmin']),
    });

    await expect(
      service.impersonate('admin-1', 'target-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(record).not.toHaveBeenCalled();
  });

  it('never logs a self-impersonation attempt (rejected before any lookup)', async () => {
    const { service, record, findById } = buildService({});

    await expect(
      service.impersonate('admin-1', 'admin-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findById).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
});

describe('AdminService.deleteUser', () => {
  it('writes an audit-log entry before the hard delete, so the trail survives even if the delete itself fails', async () => {
    const calls: string[] = [];
    const record = jest.fn().mockImplementation(() => {
      calls.push('record');
      return Promise.resolve();
    });
    const hardDelete = jest.fn().mockImplementation(() => {
      calls.push('hardDelete');
      return Promise.resolve();
    });

    const { service } = buildService({
      findById: jest.fn().mockResolvedValue({ id: 'target-1' }),
      getRoles: jest.fn().mockResolvedValue(['tutor']),
      record,
      hardDelete,
    });

    await service.deleteUser('admin-1', 'target-1');

    expect(record).toHaveBeenCalledWith({
      actorId: 'admin-1',
      actorRole: 'superadmin',
      action: 'admin.user.delete',
      entity: 'users',
      entityId: 'target-1',
      diff: { roles: ['tutor'] },
    });
    expect(calls).toEqual(['record', 'hardDelete']);
  });

  it('does not log or delete a superadmin target', async () => {
    const { service, record, hardDelete } = buildService({
      findById: jest.fn().mockResolvedValue({ id: 'target-1' }),
      getRoles: jest.fn().mockResolvedValue(['superadmin']),
    });

    await expect(
      service.deleteUser('admin-1', 'target-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(record).not.toHaveBeenCalled();
    expect(hardDelete).not.toHaveBeenCalled();
  });
});
