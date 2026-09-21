import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { AssessmentsRepository } from '../assessments.repository';
import { AssessmentsService } from '../assessments.service';
import { BatchesRepository } from '../../scheduling/batches/batches.repository';
import { NotificationsService } from '../../notifications/notifications.service';
import { AnalyticsService } from '../../analytics/analytics.service';
import { STORAGE_PROVIDER } from '../../../common/storage/storage-provider.interface';
import type { StorageProvider } from '../../../common/storage/storage-provider.interface';
import { ScorecardTemplateService } from './scorecard-template.service';
import { ScorecardImportService } from './scorecard-import.service';
import type { ImportOutcome } from './scorecard-import.service';
import { academicWeekStart, ASSESSMENT_TIMEZONE } from '../academic-week.util';
import {
  academyIdOf,
  type TeachingContext,
} from '../../teaching-context/teaching-context';
import { readUploadedObject } from '../storage-errors.util';
import type { CreateOfflineAssessmentDto } from '../dto/create-offline-assessment.dto';
import {
  ALLOWED_QUESTION_PAPER_MIMES,
  MAX_QUESTION_PAPER_BYTES,
} from '../dto/question-paper-upload-url.dto';
import { MAX_SCORECARD_BYTES } from '../dto/scorecard-upload-url.dto';

const QUESTION_PAPER_EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    '.docx',
};

const SCHEDULABLE_STATUSES = ['scheduled', 'scorecard_pending', 'overdue'];

/**
 * Offline assessment flow (spec §9-16): create draft -> mandatory
 * question paper upload -> schedule (server-enforced gate, §12/§34) ->
 * download roster template (§13/§33, always generated fresh) -> upload
 * + validate + transactionally import scorecard (§14/§15) -> completion
 * is system-controlled only (§39), with late-completion preserved
 * (§16).
 */
@Injectable()
export class OfflineAssessmentsService {
  private readonly logger = new Logger(OfflineAssessmentsService.name);

  constructor(
    private readonly repository: AssessmentsRepository,
    private readonly assessments: AssessmentsService,
    private readonly batchesRepository: BatchesRepository,
    private readonly notificationsService: NotificationsService,
    private readonly analytics: AnalyticsService,
    private readonly scorecardTemplate: ScorecardTemplateService,
    private readonly scorecardImport: ScorecardImportService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async create(tutorId: string, dto: CreateOfflineAssessmentDto) {
    const academyId = await this.assessments.assertOwnsBatches(
      tutorId,
      dto.batchIds,
    );

    return this.repository.create({
      tutorId,
      academyId,
      mode: 'offline',
      title: dto.title,
      subjectId: dto.subjectId,
      batchIds: dto.batchIds,
      maxScore: dto.maxScore,
      assessmentDate: dto.assessmentDate,
      scorecardDeadlineAt: null,
      weekStartDate: academicWeekStart(dto.assessmentDate),
    });
  }

  listForTutor(tutorId: string, ctx: TeachingContext) {
    return this.repository.listForTutor(tutorId, academyIdOf(ctx), 'offline');
  }

  async getOwn(tutorId: string, assessmentId: string) {
    const assessment = await this.assessments.getOwnedAssessment(
      tutorId,
      assessmentId,
    );
    const batches =
      await this.repository.listBatchesForAssessment(assessmentId);
    return { ...assessment, batches };
  }

  /** Persists the DB row before handing out the presigned URL — same
   *  order MaterialsService/AcademyOwnerService use, so a request for the
   *  question paper's download URL always has a real object key to
   *  resolve, even before the client's PUT lands. */
  async createQuestionPaperUploadUrl(
    tutorId: string,
    assessmentId: string,
    mime: string,
    sizeBytes: number,
  ) {
    const assessment = await this.assessments.getOwnedAssessment(
      tutorId,
      assessmentId,
    );
    this.assertOffline(assessment);
    this.assertDraft(assessment);

    if (!ALLOWED_QUESTION_PAPER_MIMES.includes(mime as never)) {
      throw new BadRequestException(
        `Question paper must be one of: ${ALLOWED_QUESTION_PAPER_MIMES.join(', ')}`,
      );
    }
    if (sizeBytes > MAX_QUESTION_PAPER_BYTES) {
      throw new BadRequestException(
        `File is too large (max ${Math.floor(MAX_QUESTION_PAPER_BYTES / 1024 / 1024)}MB)`,
      );
    }

    const objectKey = `assessment-question-papers/${tutorId}/${assessmentId}/${randomBytes(8).toString('hex')}${
      QUESTION_PAPER_EXTENSIONS[mime] ?? ''
    }`;

    await this.repository.setQuestionPaper(assessmentId, objectKey, mime);
    return this.storage.createPresignedUpload(objectKey, mime, sizeBytes);
  }

  /** Question paper access, gated: the owning tutor, or an academy admin
   *  whose academy the tutor is an active member of — enforced by the
   *  caller (see academy-owner-assessments.service.ts for the academy
   *  side; this method itself only enforces tutor ownership). */
  async getQuestionPaperDownloadUrl(tutorId: string, assessmentId: string) {
    const assessment = await this.assessments.getOwnedAssessment(
      tutorId,
      assessmentId,
    );
    return this.resolveQuestionPaperUrl(assessment);
  }

  async resolveQuestionPaperUrl(assessment: {
    question_paper_object_key: string | null;
  }) {
    if (!assessment.question_paper_object_key) {
      throw new BadRequestException('No question paper has been uploaded yet');
    }
    return {
      url: await this.storage.createDownloadUrl(
        assessment.question_paper_object_key,
      ),
    };
  }

  /** The hard gate: an offline assessment cannot become SCHEDULED without
   *  a question paper — enforced server-side, not just in the UI
   *  (§10/§12/§34). */
  async schedule(tutorId: string, assessmentId: string) {
    const assessment = await this.assessments.getOwnedAssessment(
      tutorId,
      assessmentId,
    );
    this.assertOffline(assessment);
    this.assertDraft(assessment);

    if (!assessment.question_paper_object_key) {
      throw new BadRequestException(
        'Question paper is required before scheduling an offline assessment.',
      );
    }
    if (!assessment.assessment_date) {
      throw new BadRequestException('Assessment date is required');
    }
    if (!assessment.max_score || assessment.max_score <= 0) {
      throw new BadRequestException('A valid maximum score is required');
    }

    const scorecardDeadlineAt = DateTime.fromISO(assessment.assessment_date, {
      zone: ASSESSMENT_TIMEZONE,
    })
      .plus({ days: 2 })
      .endOf('day')
      .toUTC()
      .toJSDate();

    const updated = await this.repository.updateStatus(
      assessmentId,
      'scheduled',
    );
    // scorecard_deadline_at has no dedicated repository setter — reuse
    // the same transaction-free update path via setMaxScore's sibling
    // pattern would duplicate columns unnecessarily, so it's set here
    // directly through updateStatus's extra columns instead.
    await this.repository.setScorecardDeadline(
      assessmentId,
      scorecardDeadlineAt,
    );

    this.analytics.capture(tutorId, 'offline_assessment_scheduled', {
      assessmentId,
      batchCount: (await this.repository.listBatchIds(assessmentId)).length,
    });

    return { ...updated, scorecard_deadline_at: scorecardDeadlineAt };
  }

  async downloadScorecardTemplate(
    tutorId: string,
    assessmentId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const assessment = await this.assessments.getOwnedAssessment(
      tutorId,
      assessmentId,
    );
    this.assertOffline(assessment);

    const batches =
      await this.repository.listBatchesForAssessment(assessmentId);
    const rows = (
      await Promise.all(
        batches.map(async (batch) => {
          const enrollments = await this.batchesRepository.listEnrollments(
            batch.id,
          );
          return enrollments
            .filter((e) => e.status === 'active')
            .map((e) => ({
              studentId: e.student_id,
              studentName: e.display_name ?? e.student_id,
              batchId: batch.id,
              batchName: batch.title,
            }));
        }),
      )
    ).flat();

    const buffer = await this.scorecardTemplate.build(rows);
    return {
      buffer,
      filename: `scorecard-${assessment.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.xlsx`,
    };
  }

  async createScorecardUploadUrl(
    tutorId: string,
    assessmentId: string,
    sizeBytes: number,
  ) {
    const assessment = await this.assessments.getOwnedAssessment(
      tutorId,
      assessmentId,
    );
    this.assertOffline(assessment);
    if (!SCHEDULABLE_STATUSES.includes(assessment.status)) {
      throw new BadRequestException(
        `Cannot upload a scorecard while the assessment is ${assessment.status}`,
      );
    }
    if (sizeBytes > MAX_SCORECARD_BYTES) {
      throw new BadRequestException(
        `File is too large (max ${Math.floor(MAX_SCORECARD_BYTES / 1024 / 1024)}MB)`,
      );
    }

    const objectKey = `assessment-scorecards/${tutorId}/${assessmentId}/${randomBytes(8).toString('hex')}.xlsx`;
    const upload = await this.storage.createPresignedUpload(
      objectKey,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes,
    );
    return { ...upload, objectKey };
  }

  async processScorecard(
    tutorId: string,
    assessmentId: string,
    objectKey: string,
  ) {
    const assessment = await this.assessments.getOwnedAssessment(
      tutorId,
      assessmentId,
    );
    this.assertOffline(assessment);
    if (!SCHEDULABLE_STATUSES.includes(assessment.status)) {
      throw new BadRequestException(
        `Cannot upload a scorecard while the assessment is ${assessment.status}`,
      );
    }
    if (
      !objectKey.startsWith(`assessment-scorecards/${tutorId}/${assessmentId}/`)
    ) {
      throw new BadRequestException('Invalid object key for this assessment');
    }

    let outcome: ImportOutcome;
    try {
      const buffer = await readUploadedObject(
        this.storage,
        objectKey,
        'scorecard',
      );
      outcome = await this.scorecardImport.import(assessment, buffer, tutorId);
    } finally {
      // Scratch upload — not the permanent artifact (only the DB
      // results and the scorecard_imports audit row are), so it's
      // cleaned up either way. Best-effort, matches
      // AssessmentService.submit's stale-file cleanup discipline.
      await this.storage.delete(objectKey).catch((err: unknown) => {
        this.logger.warn(
          `Failed to delete scratch scorecard upload "${objectKey}": ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }

    if (outcome.status === 'failed') {
      await this.notificationsService.notify({
        userIds: [tutorId],
        type: 'assessment_scorecard_validation_failed',
        title: `Scorecard validation failed: ${assessment.title}`,
        body: `${outcome.errors.length} issue(s) found — see the assessment for details`,
        payload: { assessmentId },
      });
      this.analytics.capture(tutorId, 'offline_scorecard_validation_failed', {
        assessmentId,
        errorCount: outcome.errors.length,
      });
      return outcome;
    }

    const batchIds = await this.repository.listBatchIds(assessmentId);
    const studentIds = await this.assessments.requiredStudentIds(batchIds);
    await this.notificationsService.notify({
      userIds: [tutorId],
      type: 'assessment_completed',
      title: `Completed: ${assessment.title}`,
      body: outcome.completedLate
        ? 'Scorecard imported (completed late)'
        : 'Scorecard imported successfully',
      payload: { assessmentId, mode: 'offline' },
    });
    await this.notificationsService.notify({
      userIds: studentIds,
      type: 'assessment_result_available',
      title: `Result available: ${assessment.title}`,
      body: 'Your result is ready to view',
      payload: { assessmentId },
    });

    this.analytics.capture(tutorId, 'offline_scorecard_imported', {
      assessmentId,
      rowCount: outcome.rowCount,
      completedLate: outcome.completedLate,
    });

    return outcome;
  }

  listScorecardImports(tutorId: string, assessmentId: string) {
    return this.assessments
      .getOwnedAssessment(tutorId, assessmentId)
      .then(() => this.repository.listScorecardImports(assessmentId));
  }

  private assertOffline(assessment: { mode: string }): void {
    if (assessment.mode !== 'offline') {
      throw new BadRequestException('This assessment is not offline');
    }
  }

  private assertDraft(assessment: { status: string }): void {
    if (assessment.status !== 'draft') {
      throw new BadRequestException(
        `This assessment is already ${assessment.status}`,
      );
    }
  }
}
