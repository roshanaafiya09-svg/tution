// AcademyVerificationService transitively imports several repositories
// that import database.module.ts, which pulls in Kysely's real (ESM)
// package at the top level for its Postgres pool setup — this Jest
// config can't transform that (see users.repository.spec.ts for the
// same workaround). The test never touches Nest's DI container
// (AcademyVerificationService is constructed directly below with
// mocked dependencies), so the token's actual value doesn't matter;
// only importing it without crashing does.
jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AcademyVerificationService } from './academy-verification.service';
import type { AcademyVerificationRepository } from './academy-verification.repository';
import type { AcademiesRepository } from '../academies/academies.repository';
import type { ConsentService } from '../../trust/consent/consent.service';
import type { AuditLogService } from '../../trust/audit/audit-log.service';

/**
 * Covers the Phase 1 state machine: NOT_STARTED -> (consent + start) ->
 * pending -> reviewer decision -> a terminal state, plus the two
 * invariants the brief calls out explicitly — a caller can never set
 * their own 'verified' status, and academies.verification_status (the
 * existing 3-state field gating discovery) only ever syncs from a
 * terminal outcome, never from under_review/needs_manual_review.
 */
function buildService(overrides: {
  findByOwnerUserId?: jest.Mock;
  setVerificationStatus?: jest.Mock;
  findLatestForAcademy?: jest.Mock;
  hasOpenSubmission?: jest.Mock;
  create?: jest.Mock;
  findById?: jest.Mock;
  review?: jest.Mock;
  listQueue?: jest.Mock;
  consentRecord?: jest.Mock;
  auditRecord?: jest.Mock;
}) {
  const findByOwnerUserId =
    overrides.findByOwnerUserId ??
    jest.fn().mockResolvedValue({ id: 'academy_1' });
  const setVerificationStatus =
    overrides.setVerificationStatus ?? jest.fn().mockResolvedValue(undefined);
  const academiesRepository = {
    findByOwnerUserId,
    setVerificationStatus,
  } as unknown as AcademiesRepository;

  const findLatestForAcademy =
    overrides.findLatestForAcademy ?? jest.fn().mockResolvedValue(undefined);
  const hasOpenSubmission =
    overrides.hasOpenSubmission ?? jest.fn().mockResolvedValue(false);
  const create =
    overrides.create ??
    jest.fn().mockResolvedValue({ id: 'submission_1', status: 'pending' });
  const findById = overrides.findById ?? jest.fn();
  const review =
    overrides.review ??
    jest
      .fn()
      .mockImplementation((id: string, status: string) =>
        Promise.resolve({ id, status }),
      );
  const listQueue = overrides.listQueue ?? jest.fn();
  const repository = {
    findLatestForAcademy,
    hasOpenSubmission,
    create,
    findById,
    review,
    listQueue,
  } as unknown as AcademyVerificationRepository;

  const consentRecord =
    overrides.consentRecord ?? jest.fn().mockResolvedValue({ id: 'consent_1' });
  const consentService = {
    record: consentRecord,
  } as unknown as ConsentService;

  const auditRecord =
    overrides.auditRecord ?? jest.fn().mockResolvedValue(undefined);
  const auditLog = { record: auditRecord } as unknown as AuditLogService;

  const service = new AcademyVerificationService(
    repository,
    academiesRepository,
    consentService,
    auditLog,
  );

  return {
    service,
    findByOwnerUserId,
    setVerificationStatus,
    findLatestForAcademy,
    hasOpenSubmission,
    create,
    findById,
    review,
    listQueue,
    consentRecord,
    auditRecord,
  };
}

describe('AcademyVerificationService.getMyStatus', () => {
  it('reports not_started when no submission exists yet', async () => {
    const { service } = buildService({
      findLatestForAcademy: jest.fn().mockResolvedValue(undefined),
    });

    const status = await service.getMyStatus('owner_1');

    expect(status.status).toBe('not_started');
  });

  it('reports the latest submission status once one exists', async () => {
    const { service } = buildService({
      findLatestForAcademy: jest.fn().mockResolvedValue({
        status: 'under_review',
        reason: null,
        created_at: new Date('2026-01-01'),
        reviewed_at: null,
      }),
    });

    const status = await service.getMyStatus('owner_1');

    expect(status.status).toBe('under_review');
  });

  it('throws if the caller has no academy yet', async () => {
    const { service } = buildService({
      findByOwnerUserId: jest.fn().mockResolvedValue(undefined),
    });

    await expect(service.getMyStatus('owner_1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('AcademyVerificationService.start', () => {
  const dto = { consent: true as const, policyVersion: '2026-01' };

  it('records consent, creates a submission, and audit-logs it', async () => {
    const { service, consentRecord, create, auditRecord } = buildService({});

    await service.start('owner_1', dto, '1.2.3.4', 'test-agent');

    expect(consentRecord).toHaveBeenCalledWith(
      'owner_1',
      { consentType: 'academy_kyc', policyVersion: '2026-01' },
      '1.2.3.4',
      'test-agent',
    );
    expect(create).toHaveBeenCalledWith({
      academyId: 'academy_1',
      consentRecordId: 'consent_1',
    });
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'academy_kyc.start' }),
    );
  });

  it('refuses a second submission while one is already open', async () => {
    const { service, create, consentRecord } = buildService({
      hasOpenSubmission: jest.fn().mockResolvedValue(true),
    });

    await expect(
      service.start('owner_1', dto, null, null),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Never even gets to recording consent for a submission it won't create.
    expect(consentRecord).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('AcademyVerificationService.review', () => {
  it('rejects reviewing a submission that was already resolved', async () => {
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue({ id: 's1', status: 'verified' }),
    });

    await expect(
      service.review('admin_1', 'superadmin', 's1', { status: 'verified' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a reason to reject', async () => {
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue({ id: 's1', status: 'pending' }),
    });

    await expect(
      service.review('admin_1', 'superadmin', 's1', { status: 'rejected' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a reason for needs_manual_review too', async () => {
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue({ id: 's1', status: 'pending' }),
    });

    await expect(
      service.review('admin_1', 'superadmin', 's1', {
        status: 'needs_manual_review',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('syncs academies.verification_status to verified on approval', async () => {
    const { service, setVerificationStatus, auditRecord } = buildService({
      findById: jest
        .fn()
        .mockResolvedValue({ id: 's1', status: 'pending', academy_id: 'a1' }),
    });

    await service.review('admin_1', 'superadmin', 's1', {
      status: 'verified',
    });

    expect(setVerificationStatus).toHaveBeenCalledWith('a1', 'verified');
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'academy_kyc.verified' }),
    );
  });

  it('syncs academies.verification_status to rejected on rejection', async () => {
    const { service, setVerificationStatus } = buildService({
      findById: jest
        .fn()
        .mockResolvedValue({ id: 's1', status: 'pending', academy_id: 'a1' }),
    });

    await service.review('admin_1', 'superadmin', 's1', {
      status: 'rejected',
      reason: 'ID document unreadable',
    });

    expect(setVerificationStatus).toHaveBeenCalledWith('a1', 'rejected');
  });

  it('does NOT touch academies.verification_status for under_review — an ambiguous result must never silently read as resolved', async () => {
    const { service, setVerificationStatus } = buildService({
      findById: jest
        .fn()
        .mockResolvedValue({ id: 's1', status: 'pending', academy_id: 'a1' }),
    });

    await service.review('admin_1', 'trust_safety', 's1', {
      status: 'under_review',
    });

    expect(setVerificationStatus).not.toHaveBeenCalled();
  });

  it('does NOT touch academies.verification_status for needs_manual_review', async () => {
    const { service, setVerificationStatus } = buildService({
      findById: jest
        .fn()
        .mockResolvedValue({ id: 's1', status: 'pending', academy_id: 'a1' }),
    });

    await service.review('admin_1', 'superadmin', 's1', {
      status: 'needs_manual_review',
      reason: 'Business registration doc looks altered',
    });

    expect(setVerificationStatus).not.toHaveBeenCalled();
  });
});
