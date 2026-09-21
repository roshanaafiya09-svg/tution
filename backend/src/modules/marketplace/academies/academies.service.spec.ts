// Transitively imports database.module.ts (real Kysely/pg pool setup, an
// ESM dependency this Jest config can't transform) — same workaround as
// teacher-leave.service.spec.ts.
jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

import { NotFoundException } from '@nestjs/common';
import { AcademiesService } from './academies.service';
import type { AcademiesRepository } from './academies.repository';
import type { AcademyContactRequestsRepository } from './academy-contact-requests.repository';
import type {
  NotificationsService,
  NotifyInput,
} from '../../notifications/notifications.service';

const ACADEMY_ID = 'academy-1';
const REQUEST_ID = 'contact-1';

/** Only contactAcademy() is under test here — every other constructor
 *  dependency is untouched by that method, so it's stubbed with an
 *  empty object rather than a full mock of AcademiesService's much
 *  larger discovery/search surface. */
function buildService(overrides: {
  findBySlug?: jest.Mock;
  createContactRequest?: jest.Mock;
  notify?: jest.Mock<Promise<void>, [NotifyInput]>;
}) {
  const academiesRepository = {
    findBySlug:
      overrides.findBySlug ??
      jest.fn().mockResolvedValue({ id: ACADEMY_ID, owner_user_id: 'owner-1' }),
  } as unknown as AcademiesRepository;

  const academyContactRequestsRepository = {
    create:
      overrides.createContactRequest ??
      jest.fn().mockResolvedValue({ id: REQUEST_ID }),
  } as unknown as AcademyContactRequestsRepository;

  const notify =
    overrides.notify ??
    jest.fn<Promise<void>, [NotifyInput]>().mockResolvedValue(undefined);
  const notificationsService = { notify } as unknown as NotificationsService;

  const service = new AcademiesService(
    academiesRepository,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    academyContactRequestsRepository,
    {} as never,
    {} as never,
    notificationsService,
    {} as never,
  );

  return { service, notify };
}

describe('AcademiesService.contactAcademy', () => {
  it('notifies the academy owner of a new lead', async () => {
    const { service, notify } = buildService({});

    await service.contactAcademy('some-academy', 'requester-1', 'student', {
      message: 'Interested in joining',
    });

    const [call] = notify.mock.calls.map((c) => c[0]);
    expect(call.userIds).toEqual(['owner-1']);
    expect(call.type).toBe('academy_contact_request_received');
    expect(call.payload).toEqual(
      expect.objectContaining({ academyId: ACADEMY_ID, requestId: REQUEST_ID }),
    );
  });

  it('skips the notification, without failing, when the academy has no owner yet', async () => {
    const findBySlug = jest
      .fn()
      .mockResolvedValue({ id: ACADEMY_ID, owner_user_id: null });
    const { service, notify } = buildService({ findBySlug });

    const result = await service.contactAcademy(
      'some-academy',
      'requester-1',
      'parent',
      { message: null } as never,
    );

    expect(result.id).toBe(REQUEST_ID);
    expect(notify).not.toHaveBeenCalled();
  });

  it('still records the lead even if notifying the owner fails', async () => {
    const notify = jest.fn().mockRejectedValue(new Error('boom'));
    const { service } = buildService({ notify });

    const result = await service.contactAcademy(
      'some-academy',
      'requester-1',
      'student',
      { message: null } as never,
    );

    expect(result.id).toBe(REQUEST_ID);
  });

  it('rejects an unknown academy slug', async () => {
    const { service } = buildService({
      findBySlug: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      service.contactAcademy('nonexistent', 'requester-1', 'student', {
        message: null,
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
