import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FeesRepository } from './fees.repository';
import { BatchesService } from '../../scheduling/batches/batches.service';
import { ParentLinksRepository } from '../../parents/parent-links.repository';
import type { GeneratePeriodDto } from './dto/generate-period.dto';
import { AnalyticsService } from '../../analytics/analytics.service';

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
  ) {}

  /** Creates a ledger row per active student for the given period. */
  async generateForBatch(
    tutorId: string,
    batchId: string,
    dto: GeneratePeriodDto,
  ) {
    const batch = await this.batchesService.getOwnedBatch(tutorId, batchId);
    const expectedMinor = dto.expectedMinor ?? batch.fee_minor;

    const studentIds = await this.repository.listActiveStudentIds(batchId);

    const result = await Promise.all(
      studentIds.map((studentId) =>
        this.repository.upsert({
          tutorId,
          studentId,
          batchId,
          periodLabel: dto.periodLabel,
          expectedMinor,
        }),
      ),
    );

    this.analytics.capture(tutorId, 'fee_batch_generated', {
      batchId,
      periodLabel: dto.periodLabel,
      studentCount: studentIds.length,
    });

    return result;
  }

  listForPeriod(tutorId: string, periodLabel: string) {
    return this.repository.listForPeriod(tutorId, periodLabel);
  }

  periodTotals(tutorId: string, periodLabel: string) {
    return this.repository.periodTotals(tutorId, periodLabel);
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
    const status = paidMinor >= entry.expected_minor ? 'paid' : 'partial';
    const result = await this.repository.recordPayment(
      entryId,
      paidMinor,
      status,
      note,
    );

    this.analytics.capture(tutorId, 'fee_payment_recorded', {
      entryId,
      paidMinor,
      status,
    });

    return result;
  }

  async waive(tutorId: string, entryId: string, note: string | null) {
    await this.getOwnedEntry(tutorId, entryId);
    return this.repository.waive(entryId, note);
  }

  private async getOwnedEntry(tutorId: string, entryId: string) {
    const entry = await this.repository.findById(entryId);
    if (!entry) throw new NotFoundException('Fee entry not found');
    if (entry.tutor_id !== tutorId)
      throw new ForbiddenException('Not your fee entry');
    return entry;
  }
}
