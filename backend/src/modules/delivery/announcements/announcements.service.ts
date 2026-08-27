import { Injectable, NotFoundException } from '@nestjs/common';
import { AnnouncementsRepository } from './announcements.repository';
import { BatchesService } from '../../scheduling/batches/batches.service';
import { BatchesRepository } from '../../scheduling/batches/batches.repository';
import { NotificationsService } from '../../notifications/notifications.service';

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly repository: AnnouncementsRepository,
    private readonly batchesService: BatchesService,
    private readonly batchesRepository: BatchesRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(tutorId: string, batchId: string, body: string) {
    const batch = await this.batchesService.getOwnedBatch(tutorId, batchId);
    const announcement = await this.repository.create(batchId, tutorId, body);

    const studentIds = await this.repository.listBatchStudentIds(batchId);
    await this.notificationsService.notify({
      userIds: studentIds,
      type: 'announcement',
      title: batch.title,
      body,
      payload: { batchId, announcementId: announcement.id },
    });

    return announcement;
  }

  async listForBatch(userId: string, batchId: string, isTutor: boolean) {
    if (isTutor) {
      await this.batchesService.getOwnedBatch(userId, batchId);
    } else {
      const enrollment = await this.batchesRepository.findEnrollment(
        batchId,
        userId,
      );
      if (!enrollment || enrollment.status !== 'active') {
        throw new NotFoundException('Batch not found');
      }
    }

    return this.repository.listForBatch(batchId);
  }

  /** Bulk sibling of listForBatch — announcements across every batch the
   *  student is actively enrolled in, in one query. Batch ids are derived
   *  server-side from the student's own enrollments, never trusted from
   *  the client. */
  async listForOwnEnrolledBatches(studentId: string) {
    const batches = await this.batchesRepository.listForStudent(studentId);
    return this.repository.listForBatches(batches.map((b) => b.id));
  }
}
