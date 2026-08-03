import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PublishedQuizzesRepository,
  type PublishableQuestion,
} from './quizzes.repository';
import { QuizAttemptsRepository } from './attempts/attempts.repository';
import { QuizzesRepository as QuizDraftsRepository } from '../../ai/quizzes/quizzes.repository';
import { MaterialsRepository } from '../../delivery/materials/materials.repository';
import { BatchesRepository } from '../../scheduling/batches/batches.repository';
import { NotificationsService } from '../../notifications/notifications.service';
import { AnalyticsService } from '../../analytics/analytics.service';

/**
 * Phase 3 student-facing quiz-taking (blueprint §7/§10): publishes an
 * approved quiz_draft (ai/quizzes) into an immutable quiz + auto-grades
 * student attempts against it. This is the only thing that reads from
 * ai/quizzes' QuizzesRepository — approval and publishing stay separate
 * decisions, so a tutor can approve AI content without immediately
 * releasing it to students.
 */
@Injectable()
export class StudentQuizzesService {
  constructor(
    private readonly repository: PublishedQuizzesRepository,
    private readonly attempts: QuizAttemptsRepository,
    private readonly draftsRepository: QuizDraftsRepository,
    private readonly materialsRepository: MaterialsRepository,
    private readonly batchesRepository: BatchesRepository,
    private readonly notificationsService: NotificationsService,
    private readonly analytics: AnalyticsService,
  ) {}

  /** Idempotent: re-publishing an already-published draft returns the
   *  existing quiz rather than erroring. */
  async publish(tutorId: string, draftId: string) {
    const draft = await this.draftsRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Quiz draft not found');
    if (draft.tutor_id !== tutorId) {
      throw new ForbiddenException('Not your quiz draft');
    }
    if (draft.status !== 'approved') {
      throw new BadRequestException('Only an approved draft can be published');
    }

    const existing = await this.repository.findByDraftId(draftId);
    if (existing) return this.getWithQuestions(existing.id);

    const material = await this.materialsRepository.findById(draft.material_id);
    const draftQuestions = await this.draftsRepository.listQuestions(draftId);
    const questions: PublishableQuestion[] = draftQuestions.map((q) => ({
      questionText: q.question_text,
      choices: q.choices,
      correctChoiceIndex: q.correct_choice_index,
      difficulty: q.difficulty,
    }));

    const quiz = await this.repository.createWithQuestions(
      draftId,
      draft.batch_id,
      tutorId,
      material ? `Quiz: ${material.title}` : 'Quiz',
      questions,
    );

    const studentIds = await this.listActiveStudentIds(draft.batch_id);
    await this.notificationsService.notify({
      userIds: studentIds,
      type: 'quiz_published',
      title: `New quiz: ${quiz.title}`,
      body: `${questions.length} questions — take it now`,
      payload: { batchId: draft.batch_id, quizId: quiz.id },
    });

    this.analytics.capture(tutorId, 'quiz_published', {
      quizId: quiz.id,
      batchId: draft.batch_id,
      questionCount: questions.length,
    });

    return this.getWithQuestions(quiz.id);
  }

  async listForBatch(studentId: string, batchId: string) {
    await this.assertEnrolled(studentId, batchId);
    const rows = await this.repository.listForBatch(batchId, studentId);
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.created_at,
      questionCount: Number(r.question_count),
      attempted: r.score !== null,
      score: r.score,
      total: r.total,
      attemptedAt: r.attempted_at,
    }));
  }

  /** Fetch a quiz to take. If the student already attempted it, this
   *  returns the review view (correct answers + their choices) instead
   *  of the blank question set — one attempt only, no retakes. */
  async getToTake(studentId: string, quizId: string) {
    const quiz = await this.repository.findById(quizId);
    if (!quiz) throw new NotFoundException('Quiz not found');
    await this.assertEnrolled(studentId, quiz.batch_id);

    const questions = await this.repository.listQuestions(quizId);
    const attempt = await this.attempts.findForStudent(quizId, studentId);

    if (!attempt) {
      return {
        quiz: { id: quiz.id, title: quiz.title },
        attempted: false,
        questions: questions.map((q) => ({
          id: q.id,
          orderIndex: q.order_index,
          questionText: q.question_text,
          choices: q.choices,
        })),
      };
    }

    const chosen = attempt.answers;
    return {
      quiz: { id: quiz.id, title: quiz.title },
      attempted: true,
      score: attempt.score,
      total: attempt.total,
      submittedAt: attempt.submitted_at,
      questions: questions.map((q, index) => ({
        id: q.id,
        orderIndex: q.order_index,
        questionText: q.question_text,
        choices: q.choices,
        correctChoiceIndex: q.correct_choice_index,
        chosenChoiceIndex: chosen[index] ?? null,
      })),
    };
  }

  async submit(studentId: string, quizId: string, answers: number[]) {
    const quiz = await this.repository.findById(quizId);
    if (!quiz) throw new NotFoundException('Quiz not found');
    await this.assertEnrolled(studentId, quiz.batch_id);

    const existing = await this.attempts.findForStudent(quizId, studentId);
    if (existing) {
      throw new BadRequestException('You already attempted this quiz');
    }

    const questions = await this.repository.listQuestions(quizId);
    if (answers.length !== questions.length) {
      throw new BadRequestException(
        `Expected ${questions.length} answers, got ${answers.length}`,
      );
    }

    let score = 0;
    const results = questions.map((q, index) => {
      const chosenChoiceIndex = answers[index];
      const isCorrect = chosenChoiceIndex === q.correct_choice_index;
      if (isCorrect) score += 1;
      return {
        questionId: q.id,
        chosenChoiceIndex,
        correctChoiceIndex: q.correct_choice_index,
        isCorrect,
      };
    });

    const attempt = await this.attempts.create(
      quizId,
      studentId,
      answers,
      score,
      questions.length,
    );

    this.analytics.capture(studentId, 'quiz_attempt_submitted', {
      quizId,
      batchId: quiz.batch_id,
      score,
      total: questions.length,
    });

    return {
      id: attempt.id,
      score,
      total: questions.length,
      submittedAt: attempt.submitted_at,
      results,
    };
  }

  async listAttemptsForQuiz(tutorId: string, quizId: string) {
    const quiz = await this.repository.findById(quizId);
    if (!quiz) throw new NotFoundException('Quiz not found');
    if (quiz.tutor_id !== tutorId)
      throw new ForbiddenException('Not your quiz');
    return this.attempts.listForQuiz(quizId);
  }

  myAttempts(studentId: string) {
    return this.attempts.listForStudent(studentId);
  }

  private async getWithQuestions(quizId: string) {
    const quiz = await this.repository.findById(quizId);
    const questions = await this.repository.listQuestions(quizId);
    return { ...quiz, questions };
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
