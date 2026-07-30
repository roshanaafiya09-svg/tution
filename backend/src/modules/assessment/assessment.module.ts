import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { AssessmentController } from './assessment.controller';
import { AssessmentService } from './assessment.service';
import { AssignmentsRepository } from './assignments/assignments.repository';
import { SubmissionsRepository } from './submissions/submissions.repository';

/**
 * Bounded context: assignments, student submissions, grading/feedback.
 * Phase 3 adds quizzes + quiz_attempts here.
 * Owns tables: assignments, submissions.
 */
@Module({
  imports: [
    IdentityModule,
    SchedulingModule,
    NotificationsModule,
    DeliveryModule,
  ],
  controllers: [AssessmentController],
  providers: [AssessmentService, AssignmentsRepository, SubmissionsRepository],
  exports: [AssignmentsRepository, SubmissionsRepository],
})
export class AssessmentModule {}
