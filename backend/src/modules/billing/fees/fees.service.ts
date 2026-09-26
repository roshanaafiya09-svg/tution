import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FeesRepository } from './fees.repository';
import { ErrorCode } from '../../../common/http/error-codes';
import {
  academyIdOf,
  type TeachingContext,
} from '../../teaching-context/teaching-context';
import { BatchesService } from '../../scheduling/batches/batches.service';
import { ParentLinksRepository } from '../../parents/parent-links.repository';
import type { GeneratePeriodDto } from './dto/generate-period.dto';
import { billingPeriodLabel } from './fee-period';
import { AnalyticsService } from '../../analytics/analytics.service';
import { FeeNotificationsService } from './fee-notifications.service';

/**
 * Phase 1 is fee *tracking* only — the tutor records what they expect
 * and what they received. No payment processing (that's Phase 2 with
 * Razorpay). Blueprint §4: "tutors' #1 pain is remembering who paid".
 */
@Injectable()
export class FeesService {
  constructor(
    private readonly repository: FeesRepository,
    private readonly batchesService: BatchesService,
    private readonly parentLinksRepository: ParentLinksRepository,
    private readonly analytics: AnalyticsService,
    private readonly feeNotifications: FeeNotificationsService,
  ) {}

  /** Creates a ledger row per active student for the billing period that
   *  `dto.periodLabel` (a YYYY-MM month) falls in, per the batch's own
   *  fee_period — see fee-period.ts. Re-running it never re-prices a row
   *  that already has a payment or waiver against it (FeesRepository.
   *  upsert). */
  async generateForBatch(
    tutorId: string,
    batchId: string,
    dto: GeneratePeriodDto,
  ) {
    const batch = await this.batchesService.getOwnedBatch(tutorId, batchId);
    const expectedMinor = dto.expectedMinor ?? batch.fee_minor;
    const periodLabel = billingPeriodLabel(batch.fee_period, dto.periodLabel);

    const studentIds = await this.repository.listActiveStudentIds(batchId);

    const result = await Promise.all(
      studentIds.map((studentId) =>
        this.repository.upsert({
          tutorId,
          studentId,
          batchId,
          periodLabel,
          expectedMinor,
        }),
      ),
    );

    this.analytics.capture(tutorId, 'fee_batch_generated', {
      batchId,
      periodLabel,
      studentCount: studentIds.length,
    });

    await this.feeNotifications.notifyRaised(result);

    return result;
  }

  listForPeriod(tutorId: string, ctx: TeachingContext, periodLabel: string) {
    return this.repository.listForPeriod(
      tutorId,
      academyIdOf(ctx),
      periodLabel,
    );
  }

  periodTotals(tutorId: string, ctx: TeachingContext, periodLabel: string) {
    return this.repository.periodTotals(tutorId, academyIdOf(ctx), periodLabel);
  }

  listForStudent(studentId: string) {
    return this.repository.listForStudent(studentId);
  }

  /** Parent's view of a consented child's fee history (blueprint §3:
   *  "fee history") — mirrors ProgressService.forParent's exact
   *  consent-check pattern. 403s unless there's an active consent link. */
  async listForParent(parentId: string, studentId: string) {
    const link = await this.parentLinksRepository.findByParentAndStudent(
      parentId,
      studentId,
    );
    if (!link || link.status !== 'active') {
      throw new ForbiddenException('No active consented link to this student');
    }
    return this.repository.listForStudent(studentId);
  }

  async recordPayment(
    tutorId: string,
    entryId: string,
    paidMinor: number,
    note: string | null,
  ) {
    const entry = await this.getOwnedEntry(tutorId, entryId);
    if (paidMinor > entry.expected_minor) {
      throw new BadRequestException({
        code: ErrorCode.FEE_AMOUNT_EXCEEDS_EXPECTED,
        message: 'The recorded payment cannot exceed the expected amount.',
      });
    }
    const status = paidMinor >= entry.expected_minor ? 'paid' : 'partial';
    // Atomic claim (H5, mirrors H2's cancelIfScheduled): only succeeds
    // while the entry is still 'due'/'partial', so this can never
    // silently resurrect a 'waived' entry or overwrite a 'paid' one, and
    // a payment racing a waive resolves to exactly one winner.
    const result = await this.repository.recordPayment(
      entryId,
      paidMinor,
      status,
      note,
    );
    if (!result) {
      return this.rejectFeeTransition(await this.currentStatus(entryId));
    }

    this.analytics.capture(tutorId, 'fee_payment_recorded', {
      entryId,
      paidMinor,
      status,
    });

    await this.feeNotifications.notifyPaymentRecorded(result, {
      source: 'teacher',
    });

    return result;
  }

  async waive(tutorId: string, entryId: string, note: string | null) {
    await this.getOwnedEntry(tutorId, entryId);
    // Same atomic claim as recordPayment: a 'paid' entry can't be waived
    // (that would erase recorded collected money), and a repeat waive of
    // an already-'waived' entry is a precise conflict, not a silent no-op.
    const result = await this.repository.waive(entryId, note);
    if (!result) {
      return this.rejectFeeTransition(await this.currentStatus(entryId));
    }
    await this.feeNotifications.notifyWaived(result);
    return result;
  }

  private async currentStatus(entryId: string) {
    const fresh = await this.repository.findById(entryId);
    // The row can't vanish (fee entries are never deleted) — this only
    // runs right after an UPDATE targeting this same id found nothing,
    // meaning the row exists but its status no longer matched.
    if (!fresh) throw new NotFoundException('Fee entry not found');
    return fresh.status;
  }

  private rejectFeeTransition(currentStatus: string): never {
    if (currentStatus === 'paid') {
      throw new ConflictException({
        code: ErrorCode.FEE_ALREADY_PAID,
        message: 'This fee has already been recorded as paid.',
      });
    }
    throw new ConflictException({
      code: ErrorCode.FEE_ALREADY_WAIVED,
      message: 'This fee has already been waived.',
    });
  }

  private async getOwnedEntry(tutorId: string, entryId: string) {
    const entry = await this.repository.findById(entryId);
    if (!entry) throw new NotFoundException('Fee entry not found');
    if (entry.tutor_id !== tutorId)
      throw new ForbiddenException('Not your fee entry');
    // Same context rules as the batch the fee belongs to.
    await this.batchesService.getOwnedBatch(tutorId, entry.batch_id);
    return entry;
  }
}
