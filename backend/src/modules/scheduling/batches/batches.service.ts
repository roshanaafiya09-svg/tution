import { ErrorCode } from '../../../common/http/error-codes';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BatchesRepository } from './batches.repository';
import { SubscriptionCapacityService } from '../../billing/subscriptions/subscription-capacity.service';
import type { Transaction } from 'kysely';
import type { DB } from '../../../database/types';
import { SessionNotificationsService } from '../sessions/session-notifications.service';
import type { CreateBatchDto } from './dto/create-batch.dto';
import type { UpdateBatchDto } from './dto/update-batch.dto';
import { AnalyticsService } from '../../analytics/analytics.service';
import { TeachingContextService } from '../../teaching-context/teaching-context.service';
import {
  academyIdOf,
  currentTeachingContext,
  type TeachingContext,
} from '../../teaching-context/teaching-context';

@Injectable()
export class BatchesService {
  constructor(
    private readonly repository: BatchesRepository,
    private readonly analytics: AnalyticsService,
    private readonly teachingContext: TeachingContextService,
    private readonly sessionNotices: SessionNotificationsService,
    private readonly capacity: SubscriptionCapacityService,
  ) {}

  /** The tutor's batches in ONE context (Individual, or one academy they
   *  are an active member of) — never both mixed together. */
  listForTutor(tutorId: string, ctx: TeachingContext) {
    return this.repository.listForTutor(tutorId, academyIdOf(ctx));
  }

  listForStudent(studentId: string) {
    return this.repository.listForStudent(studentId);
  }

  listOpenWithSeats(tutorId: string, ctx: TeachingContext) {
    return this.repository.listOpenWithSeatsForTutor(tutorId, academyIdOf(ctx));
  }

  /** Creates a batch IN a context. Individual: the batch is the tutor's
   *  own private business. Academy: the batch belongs to that academy and
   *  the tutor must be one of its active members. The context is decided
   *  by the caller (the teacher's verified profile, or the academy owner's
   *  own academy) — never by anything in the DTO. */
  async create(tutorId: string, dto: CreateBatchDto, ctx: TeachingContext) {
    const academyId = academyIdOf(ctx);
    if (academyId) {
      await this.teachingContext.assertActiveMember(academyId, tutorId);
    }
    const batch = await this.repository.create(tutorId, dto, academyId);
    this.analytics.capture(tutorId, 'batch_created', {
      batchId: batch.id,
      context: academyId ? 'academy' : 'individual',
    });
    return batch;
  }

  /**
   * Loads a batch and asserts the given tutor may operate it as a tutor:
   *   1. they teach it (tutor_id),
   *   2. if it is an Academy batch, they are STILL an active member of
   *      that academy (leaving ends operating access; the academy keeps
   *      the history),
   *   3. if the request declared a teaching context, it is the batch's
   *      own context — an Academy-context request can't touch the
   *      teacher's private Individual batch and vice versa.
   * The Academy owner never comes through here; it authorises through
   * getAcademyBatch (its own ownership) instead.
   */
  async getOwnedBatch(tutorId: string, batchId: string) {
    const batch = await this.repository.findById(batchId);
    if (!batch) throw new NotFoundException('Batch not found');
    if (batch.tutor_id !== tutorId)
      throw new ForbiddenException('Not your batch');
    if (batch.academy_id) {
      await this.teachingContext.assertActiveMember(batch.academy_id, tutorId);
    }
    const active = currentTeachingContext();
    if (active && academyIdOf(active) !== batch.academy_id) {
      throw new ForbiddenException({
        code: ErrorCode.TEACHING_CONTEXT_MISMATCH,
        message: batch.academy_id
          ? 'This is an Academy batch. Switch to that academy profile to manage it.'
          : 'This is an Individual batch. Switch to your Individual profile to manage it.',
      });
    }
    return batch;
  }

  /**
   * getOwnedBatch + the subscription gate, for subscription-gated CREATION
   * actions (new sessions, invites, materials, assignments, assessments,
   * announcements — audit H1). Reads keep using getOwnedBatch so an expired
   * teacher can still see their data and renew. The subscription checked is
   * the one that owns THIS batch (its academy_id / tutor_id), never one named
   * by the request.
   */
  async getOwnedBatchForWrite(tutorId: string, batchId: string) {
    const batch = await this.getOwnedBatch(tutorId, batchId);
    await this.capacity.assertActiveForBatch(batch);
    return batch;
  }

  /** Academy-side twin of getOwnedBatchForWrite. */
  async getAcademyBatchForWrite(academyId: string, batchId: string) {
    const batch = await this.getAcademyBatch(academyId, batchId);
    await this.capacity.assertActiveForBatch(batch);
    return batch;
  }

  /** Academy-side lookup: the batch must be owned by THIS academy. An id
   *  that is an Individual batch, or another academy's, is "not found" —
   *  indistinguishable from a random id. */
  async getAcademyBatch(academyId: string, batchId: string) {
    const batch = await this.repository.findByIdInAcademy(batchId, academyId);
    if (!batch) throw new NotFoundException('Batch not found');
    return batch;
  }

  /** H6: a plain lookup with NO tutor_id-ownership assertion — for a
   *  caller that has already established its own right to see this
   *  batch some other way (SessionsService.getViewableSession, for a
   *  substitute teacher, who is never the batch's own tutor_id and so
   *  can never pass getOwnedBatch's ownership check). Still returns the
   *  batch's academy_id so the caller can enforce its own context-match
   *  rule. */
  async findByIdUnchecked(batchId: string) {
    const batch = await this.repository.findById(batchId);
    if (!batch) throw new NotFoundException('Batch not found');
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
    return this.archiveAndAnnounce(batchId);
  }

  /** H11's archive cascade, then (after it committed) the immediate
   *  cancellation notice for exactly the classes it cancelled (H4). A
   *  repeat archive cancels nothing and so announces nothing. */
  private async archiveAndAnnounce(batchId: string) {
    const { batch, cancelledSessionIds } =
      await this.repository.archive(batchId);
    await this.sessionNotices.notifyCancelled(
      cancelledSessionIds,
      'batch_archived',
    );
    return batch;
  }

  async update(tutorId: string, batchId: string, dto: UpdateBatchDto) {
    await this.getOwnedBatch(tutorId, batchId);
    return this.repository.update(batchId, dto);
  }

  async archiveForAcademy(academyId: string, batchId: string) {
    await this.getAcademyBatch(academyId, batchId);
    return this.archiveAndAnnounce(batchId);
  }

  async updateForAcademy(
    academyId: string,
    batchId: string,
    dto: UpdateBatchDto,
  ) {
    await this.getAcademyBatch(academyId, batchId);
    return this.repository.update(batchId, dto);
  }

  async listEnrollments(tutorId: string, batchId: string) {
    await this.getOwnedBatch(tutorId, batchId);
    return this.repository.listEnrollments(batchId);
  }

  async listEnrollmentsForAcademy(academyId: string, batchId: string) {
    await this.getAcademyBatch(academyId, batchId);
    return this.repository.listEnrollments(batchId);
  }

  /** Bulk sibling of listEnrollments — every enrollment across all of this
   *  tutor's batches IN THE GIVEN CONTEXT in one grouped query, backing
   *  the roster load. */
  async listEnrollmentsForOwnBatches(tutorId: string, ctx: TeachingContext) {
    const batches = await this.repository.listForTutor(
      tutorId,
      academyIdOf(ctx),
    );
    return this.repository.listEnrollmentsForBatches(batches.map((b) => b.id));
  }

  /**
   * The ONE enrollment path (invite redemption goes through here). Everything
   * happens in a single transaction with two row locks, taken in a fixed
   * order (subscription row, then batch row), so concurrent requests queue
   * instead of racing:
   *   - a batch can never exceed its capacity (audit H9) — the count is taken
   *     under the batch lock; the enrollments trigger is the DB backstop;
   *   - an owner can never exceed the 25-student blocks they paid for, and an
   *     expired subscription cannot take on students (audit H1);
   *   - `beforeEnroll` (the invite-use claim) runs in the SAME transaction,
   *     so a rejected enrollment neither leaves a row nor burns an invite use.
   * Re-enrolling a student who is already active is an idempotent no-op.
   */
  async enroll(
    batchId: string,
    studentId: string,
    source: 'direct' | 'invite' = 'direct',
    options: {
      beforeEnroll?: (trx: Transaction<DB>) => Promise<void>;
    } = {},
  ) {
    const preview = await this.repository.findById(batchId);
    if (!preview) throw new NotFoundException('Batch not found');

    // Cheap, lock-free short circuit for the common double-click / re-open.
    const already = await this.repository.findEnrollment(batchId, studentId);
    if (already?.status === 'active') return already;

    let created: Awaited<ReturnType<BatchesRepository['enrollTx']>>;
    try {
      created = await this.repository.transaction(async (trx) => {
        const locked = await this.capacity.lockForEnrollment(trx, preview);
        const batch = await this.repository.lockBatch(trx, batchId);
        if (!batch) throw new NotFoundException('Batch not found');
        if (batch.status !== 'active') {
          throw new BadRequestException('This batch is no longer active');
        }

        const existing = await this.repository.findEnrollmentTx(
          trx,
          batchId,
          studentId,
        );
        if (existing?.status === 'active') return existing;

        if (options.beforeEnroll) await options.beforeEnroll(trx);

        const taken = await this.repository.countActiveEnrollmentsTx(
          trx,
          batchId,
        );
        if (taken >= batch.capacity) throw this.batchFull();

        await this.capacity.assertStudentFits(trx, locked, studentId);
        return this.repository.enrollTx(trx, batchId, studentId);
      });
    } catch (err) {
      // Database backstop tripped (only reachable if the locked count above
      // and the trigger ever disagreed) — same user-facing answer.
      if (
        (err as { code?: string }).code === '23514' &&
        /batch_capacity_exceeded/.test((err as Error).message)
      ) {
        throw this.batchFull();
      }
      throw err;
    }

    this.analytics.capture(studentId, 'student_enrolled', {
      batchId,
      enrollmentSource: source,
    });
    return created;
  }

  private batchFull(): BadRequestException {
    return new BadRequestException({
      code: ErrorCode.BATCH_FULL,
      message: 'This batch is full',
    });
  }

  async removeStudent(
    tutorId: string,
    batchId: string,
    studentId: string,
  ): Promise<void> {
    await this.getOwnedBatch(tutorId, batchId);
    await this.repository.removeEnrollment(batchId, studentId);
  }

  async removeStudentForAcademy(
    academyId: string,
    batchId: string,
    studentId: string,
  ): Promise<void> {
    await this.getAcademyBatch(academyId, batchId);
    await this.repository.removeEnrollment(batchId, studentId);
  }
}
