import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AssessmentsRepository } from './assessments.repository';
import { BatchesService } from '../scheduling/batches/batches.service';
import { BatchesRepository } from '../scheduling/batches/batches.repository';

/**
 * Shared logic used by both OnlineAssessmentsService and
 * OfflineAssessmentsService: ownership checks, batch authorization,
 * enrollment checks. Mode-specific flows (generate/publish/submit vs.
 * schedule/scorecard) live in their own services.
 */
@Injectable()
export class AssessmentsService {
  constructor(
    private readonly repository: AssessmentsRepository,
    private readonly batchesService: BatchesService,
    private readonly batchesRepository: BatchesRepository,
  ) {}

  /** Never trusts client-supplied batch ids as authorization — every one
   *  is re-checked against the caller's own batches (§4/§32). Dedupes
   *  defensively even though the DTO already enforces uniqueness. */
  async assertOwnsBatches(tutorId: string, batchIds: string[]): Promise<void> {
    const unique = Array.from(new Set(batchIds));
    await Promise.all(
      unique.map((batchId) =>
        this.batchesService.getOwnedBatch(tutorId, batchId),
      ),
    );
  }

  async getOwnedAssessment(tutorId: string, assessmentId: string) {
    const assessment = await this.repository.findById(assessmentId);
    if (!assessment) throw new NotFoundException('Assessment not found');
    if (assessment.tutor_id !== tutorId) {
      throw new ForbiddenException('Not your assessment');
    }
    return assessment;
  }

  async assertEnrolledInAny(
    studentId: string,
    batchIds: string[],
  ): Promise<string> {
    for (const batchId of batchIds) {
      const enrollment = await this.batchesRepository.findEnrollment(
        batchId,
        studentId,
      );
      if (enrollment?.status === 'active') return batchId;
    }
    throw new ForbiddenException(
      'You are not enrolled in any batch this assessment was assigned to',
    );
  }

  /** Distinct active students across every selected batch — the
   *  "required roster" for both notification fan-out and online
   *  completion checks (§8/§20/§40). */
  requiredStudentIds(batchIds: string[]): Promise<string[]> {
    return this.batchesRepository.listDistinctStudentIdsForBatches(batchIds);
  }

  listBatchIds(assessmentId: string) {
    return this.repository.listBatchIds(assessmentId);
  }
}
