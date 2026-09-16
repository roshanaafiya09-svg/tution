// Transitively imports database.module.ts (real Kysely/pg pool setup, an
// ESM dependency this Jest config can't transform) — same workaround as
// academy-owner-announcements.service.spec.ts.
jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

import { NotFoundException } from '@nestjs/common';
import { AnnouncementRecipientService } from './announcement-recipient.service';
import type { AcademyAnnouncementsRepository } from './academy-announcements.repository';
import type { AcademiesRepository } from '../academies/academies.repository';
import type { NotificationsService } from '../../notifications/notifications.service';

const ANNOUNCEMENT_ID = 'announcement-1';
const ACADEMY_ID = 'academy-1';
const STUDENT_ID = 'student-1';

const ANNOUNCEMENT = {
  id: ANNOUNCEMENT_ID,
  academy_id: ACADEMY_ID,
  title: 'Diwali holiday notice',
  body: 'The academy will be closed.',
  published_at: new Date('2026-09-16T00:00:00.000Z'),
};

function buildService(overrides: {
  findById?: jest.Mock;
  findAcademyById?: jest.Mock;
  listRecentForUserByType?: jest.Mock;
}) {
  const repository = {
    findById: overrides.findById ?? jest.fn().mockResolvedValue(ANNOUNCEMENT),
  } as unknown as AcademyAnnouncementsRepository;

  const academiesRepository = {
    findById:
      overrides.findAcademyById ??
      jest
        .fn()
        .mockResolvedValue({ id: ACADEMY_ID, name: 'Bright Future Academy' }),
  } as unknown as AcademiesRepository;

  const notificationsService = {
    listRecentForUserByType:
      overrides.listRecentForUserByType ??
      jest
        .fn()
        .mockResolvedValue([{ payload: { announcementId: ANNOUNCEMENT_ID } }]),
  } as unknown as NotificationsService;

  return new AnnouncementRecipientService(
    repository,
    academiesRepository,
    notificationsService,
  );
}

describe('AnnouncementRecipientService.getForRecipient', () => {
  it('returns the announcement for a proven recipient', async () => {
    const service = buildService({});

    const result = await service.getForRecipient(STUDENT_ID, ANNOUNCEMENT_ID);

    expect(result).toEqual({
      id: ANNOUNCEMENT_ID,
      title: 'Diwali holiday notice',
      body: 'The academy will be closed.',
      academyName: 'Bright Future Academy',
      publishedAt: ANNOUNCEMENT.published_at,
    });
  });

  it('refuses a user who was never sent this announcement', async () => {
    const service = buildService({
      listRecentForUserByType: jest.fn().mockResolvedValue([]),
    });

    await expect(
      service.getForRecipient(STUDENT_ID, ANNOUNCEMENT_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a user whose notifications are for a DIFFERENT announcement', async () => {
    const service = buildService({
      listRecentForUserByType: jest
        .fn()
        .mockResolvedValue([{ payload: { announcementId: 'some-other-id' } }]),
    });

    await expect(
      service.getForRecipient(STUDENT_ID, ANNOUNCEMENT_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 for a nonexistent announcement id', async () => {
    const service = buildService({
      findById: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      service.getForRecipient(STUDENT_ID, ANNOUNCEMENT_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
