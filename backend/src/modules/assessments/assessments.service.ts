import { ErrorCode } from '../../common/http/error-codes';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TeachingContextService } from '../teaching-context/teaching-context.service';
import {
  academyIdOf,
  currentTeachingContext,
} from '../teaching-context/teaching-context';
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
    private readonly teachingContext: TeachingContextService,
  ) {}

  /** Never trusts client-supplied batch ids as authorization — every one
   *  is re-checked against the caller's own batches (§4/§32). Dedupes
   *  defensively even though the DTO already enforces uniqueness. */
  /** Also returns the teaching context (academy id, or null for
   *  Individual) the assessment will live in: one assessment can only be
   *  delivered to batches of ONE context — it can never straddle a
   *  teacher's Individual batches and an academy's. */
  async assertOwnsBatches(
    tutorId: string,
    batchIds: string[],
  ): Promise<string | null> {
    const unique = Array.from(new Set(batchIds));
    const batches = await Promise.all(
      unique.map((batchId) =>
        this.batchesService.getOwnedBatch(tutorId, batchId),
      ),
    );
    const contexts = new Set(batches.map((b) => b.academy_id));
    if (contexts.size > 1) {
      throw new BadRequestException(
        'An assessment can only be assigned to batches from one profile — not a mix of Individual and Academy batches.',
      );
    }
    return batches[0]?.academy_id ?? null;
  }

  async getOwnedAssessment(tutorId: string, assessmentId: string) {
    const assessment = await this.repository.findById(assessmentId);
    if (!assessment) throw new NotFoundException('Assessment not found');
    if (assessment.tutor_id !== tutorId) {
      throw new ForbiddenException('Not your assessment');
    }
    if (assessment.academy_id) {
      await this.teachingContext.assertActiveMember(
        assessment.academy_id,
        tutorId,
      );
    }
    const active = currentTeachingContext();
    if (active && academyIdOf(active) !== assessment.academy_id) {
      throw new ForbiddenException({
        code: ErrorCode.TEACHING_CONTEXT_MISMATCH,
        message: assessment.academy_id
          ? 'This is an Academy assessment. Switch to that academy profile to manage it.'
          : 'This is an Individual assessment. Switch to your Individual profile to manage it.',
      });
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
