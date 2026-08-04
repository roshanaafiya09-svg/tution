import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { AssignmentsRepository } from './assignments/assignments.repository';
import { SubmissionsRepository } from './submissions/submissions.repository';
import { BatchesService } from '../scheduling/batches/batches.service';
import { BatchesRepository } from '../scheduling/batches/batches.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { STORAGE_PROVIDER } from '../delivery/materials/storage/storage-provider.interface';
import type { StorageProvider } from '../delivery/materials/storage/storage-provider.interface';
import type { CreateAssignmentDto } from './assignments/dto/create-assignment.dto';
import { AnalyticsService } from '../analytics/analytics.service';

const DEFAULT_TIMEZONE = 'Asia/Kolkata';

const SUBMISSION_MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

@Injectable()
export class AssessmentService {
  constructor(
    private readonly assignments: AssignmentsRepository,
    private readonly submissions: SubmissionsRepository,
    private readonly batchesService: BatchesService,
    private readonly batchesRepository: BatchesRepository,
    private readonly notificationsService: NotificationsService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly analytics: AnalyticsService,
  ) {}

  async createAssignment(tutorId: string, dto: CreateAssignmentDto) {
    const batch = await this.batchesService.getOwnedBatch(tutorId, dto.batchId);
    const timezone = dto.timezone ?? DEFAULT_TIMEZONE;

    const dueAt = DateTime.fromISO(dto.dueAtLocal, { zone: timezone });
    if (!dueAt.isValid) {
      throw new BadRequestException(
        'dueAtLocal is not a valid date/time for the given timezone',
      );
    }

    const assignment = await this.assignments.create({
      batchId: dto.batchId,
      title: dto.title,
      instructions: dto.instructions ?? null,
      dueAtUtc: dueAt.toUTC().toJSDate(),
      timezone,
    });

    const studentIds = await this.listActiveStudentIds(dto.batchId);
    await this.notificationsService.notify({
      userIds: studentIds,
      type: 'assignment_created',
      title: `New homework: ${dto.title}`,
      body: `${batch.title} — due ${dueAt.toFormat('d LLL, h:mm a')}`,
      payload: { batchId: dto.batchId, assignmentId: assignment.id },
    });

    this.analytics.capture(tutorId, 'assignment_created', {
      batchId: dto.batchId,
      assignmentId: assignment.id,
    });

    return assignment;
  }

  async listForBatch(tutorId: string, batchId: string) {
    await this.batchesService.getOwnedBatch(tutorId, batchId);
    return this.assignments.listForBatch(batchId);
  }

  listForStudent(studentId: string) {
    return this.assignments.listForStudent(studentId);
  }

  async deleteAssignment(tutorId: string, assignmentId: string): Promise<void> {
    const assignment = await this.getAssignmentOrThrow(assignmentId);
    await this.batchesService.getOwnedBatch(tutorId, assignment.batch_id);
    await this.assignments.delete(assignmentId);
  }

  /** Presigned URL for a student's submission file (photo or PDF). */
  async createSubmissionUploadUrl(
    studentId: string,
    assignmentId: string,
    mime: string,
  ) {
    const assignment = await this.getAssignmentOrThrow(assignmentId);
    await this.assertEnrolled(studentId, assignment.batch_id);

    if (!SUBMISSION_MIME_EXTENSIONS[mime]) {
      throw new BadRequestException('Submissions must be a PDF or an image');
    }

    const objectKey = `submissions/${assignmentId}/${studentId}/${randomBytes(
      6,
    ).toString('hex')}${SUBMISSION_MIME_EXTENSIONS[mime]}`;

    return this.storage.createPresignedUpload(objectKey, mime);
  }

  async submit(studentId: string, assignmentId: string, objectKeys: string[]) {
    const assignment = await this.getAssignmentOrThrow(assignmentId);
    await this.assertEnrolled(studentId, assignment.batch_id);

    const submission = await this.submissions.upsert(
      assignmentId,
      studentId,
      objectKeys,
    );

    this.analytics.capture(studentId, 'assignment_submitted', {
      assignmentId,
      batchId: assignment.batch_id,
    });

    return submission;
  }

  async listSubmissions(tutorId: string, assignmentId: string) {
    const assignment = await this.getAssignmentOrThrow(assignmentId);
    await this.batchesService.getOwnedBatch(tutorId, assignment.batch_id);
    return this.submissions.listForAssignment(assignmentId);
  }

  async getOwnSubmission(studentId: string, assignmentId: string) {
    const assignment = await this.getAssignmentOrThrow(assignmentId);
    await this.assertEnrolled(studentId, assignment.batch_id);
    return this.submissions.findForStudent(assignmentId, studentId);
  }

  /** Presigned download URLs for every file in a submission — mirrors
   *  MaterialsService.getDownloadUrl's contract, but a submission can
   *  hold multiple object_keys (one per uploaded page/photo). */
  async getSubmissionDownloadUrls(tutorId: string, submissionId: string) {
    const submission = await this.submissions.findById(submissionId);
    if (!submission) throw new NotFoundException('Submission not found');

    const assignment = await this.getAssignmentOrThrow(
      submission.assignment_id,
    );
    await this.batchesService.getOwnedBatch(tutorId, assignment.batch_id);

    const objectKeys = submission.object_keys as unknown as string[];
    const urls = await Promise.all(
      objectKeys.map((key) => this.storage.createDownloadUrl(key)),
    );
    return { urls };
  }

  async grade(
    tutorId: string,
    submissionId: string,
    grade: string,
    feedback: string | null,
  ) {
    const submission = await this.submissions.findById(submissionId);
    if (!submission) throw new NotFoundException('Submission not found');

    const assignment = await this.getAssignmentOrThrow(
      submission.assignment_id,
    );
    await this.batchesService.getOwnedBatch(tutorId, assignment.batch_id);

    const graded = await this.submissions.grade(submissionId, grade, feedback);

    await this.notificationsService.notify({
      userIds: [submission.student_id],
      type: 'submission_graded',
      title: `Graded: ${assignment.title}`,
      body: feedback ? `${grade} — ${feedback}` : grade,
      payload: { assignmentId: assignment.id, submissionId },
    });

    this.analytics.capture(tutorId, 'assignment_graded', {
      assignmentId: assignment.id,
      submissionId,
    });

    return graded;
  }

  async submissionSummary(studentId: string, batchId: string) {
    await this.assertEnrolled(studentId, batchId);
    return this.submissions.summaryForStudent(studentId, batchId);
  }

  private async getAssignmentOrThrow(assignmentId: string) {
    const assignment = await this.assignments.findById(assignmentId);
    if (!assignment) throw new NotFoundException('Assignment not found');
    return assignment;
  }

  private async assertEnrolled(
    studentId: string,
    batchId: string,
  ): Promise<void> {
    const enrollment = await this.batchesRepository.findEnrollment(
      batchId,
      studentId,
    );
    if (!enrollment || enrollment.status !== 'active') {
      throw new ForbiddenException('You are not enrolled in this batch');
    }
  }

  private listActiveStudentIds(batchId: string) {
    return this.batchesRepository
      .listEnrollments(batchId)
      .then((rows) =>
        rows.filter((r) => r.status === 'active').map((r) => r.student_id),
      );
  }
}
