import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { QuizzesModule as QuizDraftsModule } from '../ai/quizzes/quizzes.module';
import { AssessmentController } from './assessment.controller';
import { AssessmentService } from './assessment.service';
import { AssignmentsRepository } from './assignments/assignments.repository';
import { SubmissionsRepository } from './submissions/submissions.repository';
import { StudentQuizzesController } from './quizzes/quizzes.controller';
import { StudentQuizzesService } from './quizzes/quizzes.service';
import { PublishedQuizzesRepository } from './quizzes/quizzes.repository';
import { QuizAttemptsRepository } from './quizzes/attempts/attempts.repository';

/**
 * Bounded context: assignments, student submissions, grading/feedback,
 * and (Phase 3) student-facing quiz-taking. Imports ai/quizzes'
 * QuizzesModule to read approved drafts for publishing — the one thing
 * that imports that sink module back.
 * Owns tables: assignments, submissions, quizzes, quiz_questions, quiz_attempts.
 */
@Module({
  imports: [
    IdentityModule,
    SchedulingModule,
    NotificationsModule,
    DeliveryModule,
    QuizDraftsModule,
  ],
  controllers: [AssessmentController, StudentQuizzesController],
  providers: [
    AssessmentService,
    AssignmentsRepository,
    SubmissionsRepository,
    StudentQuizzesService,
    PublishedQuizzesRepository,
    QuizAttemptsRepository,
  ],
  exports: [AssignmentsRepository, SubmissionsRepository],
})
export class AssessmentModule {}
