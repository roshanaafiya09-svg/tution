import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BatchesRepository } from './batches.repository';
import type { CreateBatchDto } from './dto/create-batch.dto';
import { AnalyticsService } from '../../analytics/analytics.service';

@Injectable()
export class BatchesService {
  constructor(
    private readonly repository: BatchesRepository,
    private readonly analytics: AnalyticsService,
  ) {}

  listForTutor(tutorId: string) {
    return this.repository.listForTutor(tutorId);
  }

  listForStudent(studentId: string) {
    return this.repository.listForStudent(studentId);
  }

  async create(tutorId: string, dto: CreateBatchDto) {
    const batch = await this.repository.create(tutorId, dto);
    this.analytics.capture(tutorId, 'batch_created', { batchId: batch.id });
    return batch;
  }

  /** Loads a batch and asserts the given tutor owns it. */
  async getOwnedBatch(tutorId: string, batchId: string) {
    const batch = await this.repository.findById(batchId);
    if (!batch) throw new NotFoundException('Batch not found');
    if (batch.tutor_id !== tutorId)
      throw new ForbiddenException('Not your batch');
    return batch;
  }

  /** Loads a batch without an ownership check — for invite redemption,
   * where the caller is a prospective student, not the owning tutor. */
  async getBatchForInvite(batchId: string) {
    const batch = await this.repository.findById(batchId);
    if (!batch) throw new NotFoundException('Batch not found');
    return batch;
  }

  async archive(tutorId: string, batchId: string) {
    await this.getOwnedBatch(tutorId, batchId);
    return this.repository.archive(batchId);
  }

  async listEnrollments(tutorId: string, batchId: string) {
    await this.getOwnedBatch(tutorId, batchId);
    return this.repository.listEnrollments(batchId);
  }

  async enroll(
    batchId: string,
    studentId: string,
    source: 'direct' | 'invite' = 'direct',
  ) {
    const batch = await this.repository.findById(batchId);
    if (!batch) throw new NotFoundException('Batch not found');
    if (batch.status !== 'active') {
      throw new BadRequestException('This batch is no longer active');
    }

    const existing = await this.repository.findEnrollment(batchId, studentId);
    if (existing?.status === 'active') {
      return existing;
    }

    const activeCount = await this.repository.countActiveEnrollments(batchId);
    if (activeCount >= batch.capacity) {
      throw new BadRequestException('This batch is full');
    }

    const enrollment = await this.repository.enroll(batchId, studentId);

    this.analytics.capture(studentId, 'student_enrolled', {
      batchId,
      enrollmentSource: source,
    });

    return enrollment;
  }

  async removeStudent(
    tutorId: string,
    batchId: string,
    studentId: string,
  ): Promise<void> {
    await this.getOwnedBatch(tutorId, batchId);
    await this.repository.removeEnrollment(batchId, studentId);
  }
}
