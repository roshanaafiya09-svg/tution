import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AssessmentsRepository } from '../assessments.repository';
import { AssessmentsService } from '../assessments.service';
import { MaterialsRepository } from '../../delivery/materials/materials.repository';
import { BatchesRepository } from '../../scheduling/batches/batches.repository';
import { NotificationsService } from '../../notifications/notifications.service';
import { AnalyticsService } from '../../analytics/analytics.service';
import { AssessmentAiService } from '../../ai/assessment-ai/assessment-ai.service';
import { STORAGE_PROVIDER } from '../../../common/storage/storage-provider.interface';
import type { StorageProvider } from '../../../common/storage/storage-provider.interface';
import { extractPdfText } from '../../ai/quizzes/pdf-text';
import { academicWeekStart } from '../academic-week.util';
import { readUploadedObject } from '../storage-errors.util';
import type { CreateOnlineAssessmentDto } from '../dto/create-online-assessment.dto';
import type { UpdateAssessmentQuestionDto } from '../dto/update-assessment-question.dto';

const DEFAULT_QUESTION_COUNT = 10;

/**
 * Online assessment flow (spec §5): create draft -> upload material ->
 * Gemini generates draft questions -> teacher reviews/edits -> publish (one
 * action serves as both "approve" and "publish" — see the Assessment
 * overhaul plan's status-enum note) -> students take -> auto-graded ->
 * completion is system-derived, never manually set (§39).
 */
@Injectable()
export class OnlineAssessmentsService {
  constructor(
    private readonly repository: AssessmentsRepository,
    private readonly assessments: AssessmentsService,
    private readonly materialsRepository: MaterialsRepository,
    private readonly batchesRepository: BatchesRepository,
    private readonly notificationsService: NotificationsService,
    private readonly analytics: AnalyticsService,
    private readonly assessmentAi: AssessmentAiService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async create(tutorId: string, dto: CreateOnlineAssessmentDto) {
    await this.assessments.assertOwnsBatches(tutorId, dto.batchIds);

    return this.repository.create({
      tutorId,
      mode: 'online',
      title: dto.title,
      subjectId: dto.subjectId,
      batchIds: dto.batchIds,
      maxScore: null,
      assessmentDate: null,
      scorecardDeadlineAt: null,
      weekStartDate: academicWeekStart(),
    });
  }

  async generateQuestions(
    tutorId: string,
    assessmentId: string,
    materialId: string,
    count = DEFAULT_QUESTION_COUNT,
  ) {
    const assessment = await this.assessments.getOwnedAssessment(
      tutorId,
      assessmentId,
    );
    this.assertMode(assessment, 'online');
    this.assertDraft(assessment);

    const material = await this.materialsRepository.findById(materialId);
    if (!material) throw new NotFoundException('Material not found');
    if (material.tutor_id !== tutorId) {
      throw new ForbiddenException('Not your material');
    }
    if (material.mime !== 'application/pdf') {
      throw new BadRequestException(
        'Assessment question generation only supports PDF materials right now',
      );
    }

    const fileBytes = await readUploadedObject(
      this.storage,
      material.object_key,
      'material',
    );
    const materialText = await extractPdfText(fileBytes);

    const questions = await this.assessmentAi.generateQuestions(
      materialText,
      count,
    );
    if (questions.length === 0) {
      throw new BadRequestException(
        'AI generation produced no questions for this material',
      );
    }

    await this.repository.replaceQuestions(assessmentId, questions);
    const maxScore = questions.reduce((sum, q) => sum + q.marks, 0);
    await this.repository.setMaxScore(assessmentId, maxScore);

    this.analytics.capture(tutorId, 'assessment_questions_generated', {
      assessmentId,
      questionCount: questions.length,
    });

    return this.getWithQuestions(tutorId, assessmentId);
  }

  async getWithQuestions(tutorId: string, assessmentId: string) {
    const assessment = await this.assessments.getOwnedAssessment(
      tutorId,
      assessmentId,
    );
    const [questions, batchIds] = await Promise.all([
      this.repository.listQuestions(assessmentId),
      this.repository.listBatchIds(assessmentId),
    ]);
    return { ...assessment, batchIds, questions };
  }

  /** Per-student results for the teacher's own assessment — results stay
   *  individually tracked per student even though the assessment spans
   *  multiple batches (§6/§31). */
  async listResults(tutorId: string, assessmentId: string) {
    await this.assessments.getOwnedAssessment(tutorId, assessmentId);
    return this.repository.listResultsForAssessment(assessmentId);
  }

  listForTutor(tutorId: string) {
    return this.repository.listForTutor(tutorId, 'online');
  }

  async updateQuestion(
    tutorId: string,
    assessmentId: string,
    questionId: string,
    dto: UpdateAssessmentQuestionDto,
  ) {
    const assessment = await this.assessments.getOwnedAssessment(
      tutorId,
      assessmentId,
    );
    this.assertMode(assessment, 'online');
    this.assertDraft(assessment);

    const question = await this.repository.findQuestionById(questionId);
    if (!question || question.assessment_id !== assessment.id) {
      throw new NotFoundException('Question not found on this assessment');
    }

    const updated = await this.repository.updateQuestion(questionId, dto);

    if (dto.marks !== undefined) {
      const questions = await this.repository.listQuestions(assessmentId);
      const maxScore = questions.reduce((sum, q) => sum + q.marks, 0);
      await this.repository.setMaxScore(assessmentId, maxScore);
    }

    return updated;
  }

  /** One-way transition. Idempotent-ish: re-calling on an already
   *  published assessment just returns it rather than erroring, mirroring
   *  the legacy quiz publish endpoint's contract. */
  async publish(tutorId: string, assessmentId: string) {
    const assessment = await this.assessments.getOwnedAssessment(
      tutorId,
      assessmentId,
    );
    this.assertMode(assessment, 'online');
    if (
      assessment.status === 'published' ||
      assessment.status === 'completed'
    ) {
      return this.getWithQuestions(tutorId, assessmentId);
    }
    this.assertDraft(assessment);

    const questions = await this.repository.listQuestions(assessmentId);
    if (questions.length === 0) {
      throw new BadRequestException(
        'Generate and review at least one question before publishing',
      );
    }
    if (!assessment.max_score) {
      throw new BadRequestException(
        'Assessment has no max score — generate questions first',
      );
    }

    await this.repository.updateStatus(assessmentId, 'published', {
      publishedAt: new Date(),
    });

    const batchIds = await this.repository.listBatchIds(assessmentId);
    const studentIds = await this.assessments.requiredStudentIds(batchIds);
    await this.notificationsService.notify({
      userIds: studentIds,
      type: 'assessment_published',
      title: `New assessment: ${assessment.title}`,
      body: `${questions.length} questions — take it now`,
      payload: { assessmentId },
    });

    this.analytics.capture(tutorId, 'assessment_published', {
      assessmentId,
      batchCount: batchIds.length,
      questionCount: questions.length,
    });

    return this.getWithQuestions(tutorId, assessmentId);
  }

  /** The student's assessment list: every published online assessment
   *  across their enrolled batches (mirrors StudentQuizzesService.
   *  listForOwnEnrolledBatches), plus the offline assessments whose
   *  scorecard has been imported with a result for them. Open,
   *  not-yet-attempted online assessments come first. */
  async listForStudent(studentId: string) {
    const [online, offline] = await Promise.all([
      this.listOnlineForStudent(studentId),
      this.repository.listOfflineResultsForStudent(studentId),
    ]);

    const offlineItems = offline.map((row) => ({
      id: row.id,
      title: row.title,
      subjectId: row.subject_id,
      mode: 'offline' as const,
      status: 'completed' as const,
      publishedAt: null,
      assessmentDate: row.assessment_date,
      maxScore: row.max_score,
      attempted: true,
      score: row.score,
    }));

    const open = online.filter((a) => !a.attempted && a.status === 'published');
    const rest = online.filter((a) => a.attempted || a.status !== 'published');
    return [...open, ...rest, ...offlineItems];
  }

  private async listOnlineForStudent(studentId: string) {
    const batches = await this.batchesRepository.listForStudent(studentId);
    const batchIds = batches.map((b) => b.id);
    if (batchIds.length === 0) return [];

    const all = await this.repository.listForTutorsAcrossBatches(batchIds);
    return Promise.all(
      all.map(async (assessment) => {
        const result = await this.repository.findResult(
          assessment.id,
          studentId,
        );
        return {
          id: assessment.id,
          title: assessment.title,
          subjectId: assessment.subject_id,
          mode: 'online' as const,
          status: assessment.status,
          publishedAt: assessment.published_at,
          assessmentDate: null,
          maxScore: assessment.max_score,
          attempted: result !== undefined,
          score: result?.score ?? null,
        };
      }),
    );
  }

  async getToTake(studentId: string, assessmentId: string) {
    const assessment = await this.repository.findById(assessmentId);
    if (!assessment) throw new NotFoundException('Assessment not found');
    this.assertMode(assessment, 'online');
    if (
      assessment.status !== 'published' &&
      assessment.status !== 'completed'
    ) {
      throw new ForbiddenException('This assessment is not available yet');
    }

    const batchIds = await this.repository.listBatchIds(assessmentId);
    await this.assessments.assertEnrolledInAny(studentId, batchIds);

    const questions = await this.repository.listQuestions(assessmentId);
    const result = await this.repository.findResult(assessmentId, studentId);

    if (!result) {
      return {
        assessment: { id: assessment.id, title: assessment.title },
        attempted: false,
        // `completed` with no result of this student's own means the
        // assessment closed without them (they joined after it finished,
        // or the deadline passed) — `submit` rejects it, so the client
        // must not offer the form.
        open: assessment.status === 'published',
        questions: questions.map((q) => ({
          id: q.id,
          orderIndex: q.order_index,
          questionText: q.question_text,
          choices: q.choices,
          marks: q.marks,
        })),
      };
    }

    const chosen = result.answers ?? [];
    return {
      assessment: { id: assessment.id, title: assessment.title },
      attempted: true,
      score: result.score,
      maxScore: result.max_score,
      submittedAt: result.submitted_at,
      questions: questions.map((q, index) => ({
        id: q.id,
        orderIndex: q.order_index,
        questionText: q.question_text,
        choices: q.choices,
        marks: q.marks,
        correctChoiceIndex: q.correct_choice_index,
        explanation: q.explanation,
        chosenChoiceIndex: chosen[index] ?? null,
      })),
    };
  }

  async submit(studentId: string, assessmentId: string, answers: number[]) {
    const assessment = await this.repository.findById(assessmentId);
    if (!assessment) throw new NotFoundException('Assessment not found');
    this.assertMode(assessment, 'online');
    if (assessment.status !== 'published') {
      throw new BadRequestException(
        'This assessment is not open for submissions',
      );
    }

    const batchIds = await this.repository.listBatchIds(assessmentId);
    const studentBatchId = await this.assessments.assertEnrolledInAny(
      studentId,
      batchIds,
    );

    const existing = await this.repository.findResult(assessmentId, studentId);
    if (existing) {
      throw new BadRequestException('You already attempted this assessment');
    }

    const questions = await this.repository.listQuestions(assessmentId);
    if (answers.length !== questions.length) {
      throw new BadRequestException(
        `Expected ${questions.length} answers, got ${answers.length}`,
      );
    }

    // No AI call here — deterministic local scoring against the stored
    // answer key (spec §27: never call the AI provider per MCQ submission).
    let score = 0;
    const results = questions.map((q, index) => {
      const chosenChoiceIndex = answers[index];
      const isCorrect = chosenChoiceIndex === q.correct_choice_index;
      if (isCorrect) score += q.marks;
      return {
        questionId: q.id,
        chosenChoiceIndex,
        correctChoiceIndex: q.correct_choice_index,
        isCorrect,
        marks: q.marks,
      };
    });

    const result = await this.repository.insertResult({
      assessmentId,
      batchId: studentBatchId,
      studentId,
      score,
      maxScore: assessment.max_score ?? 0,
      source: 'online_submission',
      answers,
    });

    this.analytics.capture(studentId, 'assessment_attempt_submitted', {
      assessmentId,
      score,
      maxScore: assessment.max_score,
    });

    await this.checkOnlineCompletion(assessmentId);

    return {
      id: result.id,
      score,
      maxScore: assessment.max_score,
      submittedAt: result.submitted_at,
      results,
    };
  }

  /** System-controlled completion only (§39) — never a manual "Mark
   *  Completed". Completed when every actively-enrolled student across
   *  ALL selected batches has a result (§8). Also invoked by the
   *  scheduler sweep for the `available_until` deadline case. */
  async checkOnlineCompletion(assessmentId: string): Promise<void> {
    const assessment = await this.repository.findById(assessmentId);
    if (!assessment || assessment.status !== 'published') return;

    const batchIds = await this.repository.listBatchIds(assessmentId);
    const [requiredStudentIds, submittedCount] = await Promise.all([
      this.assessments.requiredStudentIds(batchIds),
      this.repository.countResultsForAssessment(assessmentId),
    ]);

    const deadlinePassed =
      assessment.available_until !== null &&
      new Date(assessment.available_until).getTime() <= Date.now();

    if (submittedCount < requiredStudentIds.length && !deadlinePassed) {
      return;
    }

    const now = new Date();
    await this.repository.updateStatus(assessmentId, 'completed', {
      completedAt: now,
      completedLate: false,
    });

    const studentIds = await this.assessments.requiredStudentIds(batchIds);
    await this.notificationsService.notify({
      userIds: [assessment.tutor_id],
      type: 'assessment_completed',
      title: `Completed: ${assessment.title}`,
      body: `All results are in for ${assessment.title}`,
      payload: { assessmentId, mode: 'online' },
    });
    await this.notificationsService.notify({
      userIds: studentIds,
      type: 'assessment_result_available',
      title: `Result available: ${assessment.title}`,
      body: 'Your result is ready to view',
      payload: { assessmentId },
    });
  }

  private assertMode(
    assessment: { mode: string },
    mode: 'online' | 'offline',
  ): void {
    if (assessment.mode !== mode) {
      throw new BadRequestException(`This assessment is not ${mode}`);
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
