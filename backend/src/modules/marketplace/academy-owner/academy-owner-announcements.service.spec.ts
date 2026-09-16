// Transitively imports database.module.ts (real Kysely/pg pool setup, an
// ESM dependency this Jest config can't transform) — same workaround as
// academy-owner-attendance.service.spec.ts / teacher-leave.service.spec.ts.
jest.mock('../../../database/database.module', () => ({
  KYSELY_CONNECTION: 'KYSELY_CONNECTION',
}));
jest.mock('kysely', () => ({
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AcademyOwnerAnnouncementsService } from './academy-owner-announcements.service';
import type { AcademiesRepository } from '../academies/academies.repository';
import type { AcademyMembershipsRepository } from '../academy-memberships/academy-memberships.repository';
import type { BatchesRepository } from '../../scheduling/batches/batches.repository';
import type { AttendanceRepository } from '../../scheduling/attendance/attendance.repository';
import type {
  NotificationsService,
  NotifyInput,
} from '../../notifications/notifications.service';
import type { AcademyAnnouncementsRepository } from './academy-announcements.repository';

const ACADEMY_ID = 'academy-1';
const OWNER_ID = 'owner-1';
const OTHER_ACADEMY_ID = 'academy-2';
const ANNOUNCEMENT_ID = 'announcement-1';
const TUTOR_ID = 'tutor-1';
const BATCH_ID = 'batch-1';
const STUDENT_ID = 'student-1';

function draftRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ANNOUNCEMENT_ID,
    academy_id: ACADEMY_ID,
    created_by: OWNER_ID,
    title: 'Diwali holiday notice',
    body: 'The academy will be closed.',
    audience_type: 'teachers',
    audience_batch_id: null,
    audience_teacher_id: null,
    audience_student_id: null,
    status: 'draft',
    recipient_count: null,
    published_at: null,
    ...overrides,
  };
}

function buildService(overrides: {
  findByOwnerUserId?: jest.Mock;
  findActiveMembership?: jest.Mock;
  listActiveForAcademy?: jest.Mock;
  findByIdBatch?: jest.Mock;
  listEnrollmentsForTutors?: jest.Mock;
  listDistinctStudentIdsForBatches?: jest.Mock;
  listDistinctStudentIdsForTutors?: jest.Mock;
  listActiveParentIdsForStudents?: jest.Mock;
  notify?: jest.Mock<Promise<void>, [NotifyInput]>;
  create?: jest.Mock;
  findForAcademy?: jest.Mock;
  update?: jest.Mock;
  publish?: jest.Mock;
  archive?: jest.Mock;
  deleteDraft?: jest.Mock;
}) {
  const academiesRepository = {
    findByOwnerUserId:
      overrides.findByOwnerUserId ??
      jest.fn().mockResolvedValue({ id: ACADEMY_ID }),
  } as unknown as AcademiesRepository;

  const academyMembershipsRepository = {
    findActiveMembership:
      overrides.findActiveMembership ??
      jest.fn().mockResolvedValue({ id: 'membership-1' }),
    listActiveForAcademy:
      overrides.listActiveForAcademy ??
      jest
        .fn()
        .mockResolvedValue([{ tutor_id: TUTOR_ID, display_name: 'Priya' }]),
  } as unknown as AcademyMembershipsRepository;

  const batchesRepository = {
    findById:
      overrides.findByIdBatch ??
      jest.fn().mockResolvedValue({ id: BATCH_ID, tutor_id: TUTOR_ID }),
    listEnrollmentsForTutors:
      overrides.listEnrollmentsForTutors ??
      jest.fn().mockResolvedValue([{ student_id: STUDENT_ID }]),
    listDistinctStudentIdsForBatches:
      overrides.listDistinctStudentIdsForBatches ??
      jest.fn().mockResolvedValue([STUDENT_ID]),
    listDistinctStudentIdsForTutors:
      overrides.listDistinctStudentIdsForTutors ??
      jest.fn().mockResolvedValue([STUDENT_ID]),
  } as unknown as BatchesRepository;

  const attendanceRepository = {
    listActiveParentIdsForStudents:
      overrides.listActiveParentIdsForStudents ??
      jest.fn().mockResolvedValue(['parent-1']),
  } as unknown as AttendanceRepository;

  const notify =
    overrides.notify ??
    jest.fn<Promise<void>, [NotifyInput]>().mockResolvedValue(undefined);
  const notificationsService = { notify } as unknown as NotificationsService;

  const repository = {
    create:
      overrides.create ??
      jest
        .fn()
        .mockImplementation((input: Record<string, unknown>) =>
          Promise.resolve(draftRow(input)),
        ),
    findForAcademy:
      overrides.findForAcademy ?? jest.fn().mockResolvedValue(draftRow()),
    update:
      overrides.update ??
      jest
        .fn()
        .mockImplementation(
          (id: string, academyId: string, patch: Record<string, unknown>) =>
            Promise.resolve(draftRow(patch)),
        ),
    publish:
      overrides.publish ??
      jest.fn().mockImplementation((id, academyId, recipientCount) =>
        Promise.resolve(
          draftRow({
            status: 'published',
            recipient_count: recipientCount,
            published_at: new Date(),
          }),
        ),
      ),
    archive:
      overrides.archive ??
      jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(draftRow({ status: 'archived' })),
        ),
    deleteDraft:
      overrides.deleteDraft ??
      jest.fn().mockResolvedValue({ numDeletedRows: 1n }),
    listForAcademy: jest.fn().mockResolvedValue([]),
  } as unknown as AcademyAnnouncementsRepository;

  return {
    service: new AcademyOwnerAnnouncementsService(
      academiesRepository,
      academyMembershipsRepository,
      batchesRepository,
      attendanceRepository,
      notificationsService,
      repository,
    ),
    repository,
    notify,
  };
}

describe('AcademyOwnerAnnouncementsService.create', () => {
  it('creates a draft without publishing when publishNow is not set', async () => {
    const { service, notify } = buildService({});

    const result = await service.create(OWNER_ID, {
      title: 'Notice',
      body: 'Body',
      audienceType: 'teachers',
    } as never);

    expect(result.status).toBe('draft');
    expect(notify).not.toHaveBeenCalled();
  });

  it('publishes immediately when publishNow is true, notifying every active teacher', async () => {
    const { service, notify } = buildService({});

    const result = await service.create(OWNER_ID, {
      title: 'Notice',
      body: 'Body',
      audienceType: 'teachers',
      publishNow: true,
    } as never);

    expect(result.status).toBe('published');
    expect(result.recipient_count).toBe(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: [TUTOR_ID],
        type: 'academy_announcement',
      }),
    );
  });

  it('rejects a batch belonging to another academy', async () => {
    const { service } = buildService({
      findActiveMembership: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      service.create(OWNER_ID, {
        title: 'Notice',
        body: 'Body',
        audienceType: 'batch',
        audienceBatchId: 'someone-elses-batch',
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a student not enrolled anywhere in this academy', async () => {
    const { service } = buildService({
      listEnrollmentsForTutors: jest.fn().mockResolvedValue([]),
    });

    await expect(
      service.create(OWNER_ID, {
        title: 'Notice',
        body: 'Body',
        audienceType: 'student',
        audienceStudentId: 'someone-elses-student',
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a caller with no academy at all', async () => {
    const { service } = buildService({
      findByOwnerUserId: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      service.create(OWNER_ID, {
        title: 'Notice',
        body: 'Body',
        audienceType: 'teachers',
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AcademyOwnerAnnouncementsService.publish', () => {
  it('dedupes a recipient reachable through more than one path in the academy audience', async () => {
    // Contrived but exercises the real dedup mechanism: the "parent"
    // resolved for the academy-wide audience happens to be the same id
    // as the one active teacher — a real person could plausibly be both
    // an academy's teacher and (for a different one of their own
    // children) a linked parent.
    const { service, notify } = buildService({
      findForAcademy: jest
        .fn()
        .mockResolvedValue(draftRow({ audience_type: 'academy' })),
      listActiveParentIdsForStudents: jest.fn().mockResolvedValue([TUTOR_ID]),
    });

    const result = await service.publish(OWNER_ID, ANNOUNCEMENT_ID);

    expect(result.recipient_count).toBe(2); // {TUTOR_ID, STUDENT_ID} — not 3
    expect(notify).toHaveBeenCalledTimes(1);
    const [call] = notify.mock.calls.map((c) => c[0]);
    expect(call.userIds).toHaveLength(2);
    expect(call.userIds).toEqual(
      expect.arrayContaining([TUTOR_ID, STUDENT_ID]),
    );
  });

  it('refuses to re-publish and does not double-notify when the transition loses a concurrency race', async () => {
    const publish = jest.fn().mockResolvedValue(undefined); // atomic UPDATE matched zero rows
    const { service, notify } = buildService({
      findForAcademy: jest.fn().mockResolvedValue(draftRow()),
      publish,
    });

    await expect(
      service.publish(OWNER_ID, ANNOUNCEMENT_ID),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(notify).not.toHaveBeenCalled();
  });

  it('refuses to publish something that is already published or archived', async () => {
    const { service } = buildService({
      findForAcademy: jest
        .fn()
        .mockResolvedValue(draftRow({ status: 'published' })),
    });

    await expect(
      service.publish(OWNER_ID, ANNOUNCEMENT_ID),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('still returns the published row even if notification delivery fails', async () => {
    const notify = jest.fn().mockRejectedValue(new Error('boom'));
    const { service } = buildService({ notify });

    const result = await service.publish(OWNER_ID, ANNOUNCEMENT_ID);
    expect(result.status).toBe('published');
  });

  it("won't let an academy publish an announcement that isn't theirs", async () => {
    const { service } = buildService({
      findForAcademy: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      service.publish(OTHER_ACADEMY_ID, ANNOUNCEMENT_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AcademyOwnerAnnouncementsService lifecycle guards', () => {
  it('refuses to edit a published announcement', async () => {
    const { service } = buildService({
      findForAcademy: jest
        .fn()
        .mockResolvedValue(draftRow({ status: 'published' })),
    });

    await expect(
      service.update(OWNER_ID, ANNOUNCEMENT_ID, { title: 'New' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to archive a draft', async () => {
    const { service } = buildService({
      archive: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      service.archive(OWNER_ID, ANNOUNCEMENT_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to delete a published announcement', async () => {
    const { service } = buildService({
      findForAcademy: jest
        .fn()
        .mockResolvedValue(draftRow({ status: 'published' })),
      deleteDraft: jest.fn().mockResolvedValue({ numDeletedRows: 0n }),
    });

    await expect(
      service.delete(OWNER_ID, ANNOUNCEMENT_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
