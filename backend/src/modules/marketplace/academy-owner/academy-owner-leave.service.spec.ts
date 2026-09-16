// Transitively imports database.module.ts (real Kysely/pg pool setup, an
// ESM dependency this Jest config can't transform) — same workaround as
// academy-owner-announcements.service.spec.ts / teacher-leave.service.spec.ts.
jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

import { NotFoundException } from '@nestjs/common';
import { AcademyOwnerLeaveService } from './academy-owner-leave.service';
import type { AcademiesRepository } from '../academies/academies.repository';
import type { TeacherLeaveService } from '../../holidays/teacher-leave.service';

const ACADEMY_ID = 'academy-1';
const OWNER_ID = 'owner-1';
const REQUEST_ID = 'leave-1';

function buildService(overrides: {
  findByOwnerUserId?: jest.Mock;
  getOwnedForAcademy?: jest.Mock;
  listSessionsForRequest?: jest.Mock;
}) {
  const academiesRepository = {
    findByOwnerUserId:
      overrides.findByOwnerUserId ??
      jest.fn().mockResolvedValue({ id: ACADEMY_ID }),
  } as unknown as AcademiesRepository;

  const teacherLeaveService = {
    getOwnedForAcademy:
      overrides.getOwnedForAcademy ??
      jest.fn().mockResolvedValue({ id: REQUEST_ID, academy_id: ACADEMY_ID }),
    listSessionsForRequest:
      overrides.listSessionsForRequest ?? jest.fn().mockResolvedValue([]),
  } as unknown as TeacherLeaveService;

  return {
    service: new AcademyOwnerLeaveService(
      academiesRepository,
      teacherLeaveService,
    ),
    teacherLeaveService,
  };
}

describe('AcademyOwnerLeaveService.listSessions', () => {
  it("won't let an academy view another academy's leave-request session detail", async () => {
    // Regression test for the IDOR where resolveOwnAcademy's result was
    // discarded and listSessionsForRequest(requestId) was called with no
    // academy scoping at all — any authenticated academy admin could
    // view any other academy's leave-request session detail by
    // guessing/enumerating a requestId.
    const getOwnedForAcademy = jest
      .fn()
      .mockRejectedValue(new NotFoundException('Leave request not found'));
    const listSessionsForRequest = jest.fn();
    const { service } = buildService({
      getOwnedForAcademy,
      listSessionsForRequest,
    });

    await expect(
      service.listSessions(OWNER_ID, REQUEST_ID),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(getOwnedForAcademy).toHaveBeenCalledWith(ACADEMY_ID, REQUEST_ID);
    // The unscoped fetch must never run once ownership fails.
    expect(listSessionsForRequest).not.toHaveBeenCalled();
  });

  it('returns the sessions once ownership is confirmed', async () => {
    const getOwnedForAcademy = jest
      .fn()
      .mockResolvedValue({ id: REQUEST_ID, academy_id: ACADEMY_ID });
    const { service } = buildService({
      getOwnedForAcademy,
      listSessionsForRequest: jest
        .fn()
        .mockResolvedValue([{ session_id: 's1' }]),
    });

    const result = await service.listSessions(OWNER_ID, REQUEST_ID);

    expect(getOwnedForAcademy).toHaveBeenCalledWith(ACADEMY_ID, REQUEST_ID);
    expect(result).toEqual([{ session_id: 's1' }]);
  });

  it('rejects a caller with no academy at all', async () => {
    const { service } = buildService({
      findByOwnerUserId: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      service.listSessions(OWNER_ID, REQUEST_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
