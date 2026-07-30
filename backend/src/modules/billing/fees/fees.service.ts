import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FeesRepository } from './fees.repository';
import { BatchesService } from '../../scheduling/batches/batches.service';
import type { GeneratePeriodDto } from './dto/generate-period.dto';

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

    return Promise.all(
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

  async recordPayment(
    tutorId: string,
    entryId: string,
    paidMinor: number,
    note: string | null,
  ) {
    const entry = await this.getOwnedEntry(tutorId, entryId);
    const status = paidMinor >= entry.expected_minor ? 'paid' : 'partial';
    return this.repository.recordPayment(entryId, paidMinor, status, note);
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
