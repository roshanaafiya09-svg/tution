import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { StorageModule } from '../../common/storage/storage.module';
import { AssessmentAiModule } from '../ai/assessment-ai/assessment-ai.module';
import { AssessmentsRepository } from './assessments.repository';
import { AssessmentsService } from './assessments.service';
import { OnlineAssessmentsController } from './online/online-assessments.controller';
import { OnlineAssessmentsService } from './online/online-assessments.service';
import { OfflineAssessmentsController } from './offline/offline-assessments.controller';
import { OfflineAssessmentsService } from './offline/offline-assessments.service';
import { ScorecardTemplateService } from './offline/scorecard-template.service';
import { ScorecardImportService } from './offline/scorecard-import.service';
import { AssessmentSchedulerService } from './scheduler/assessment-scheduler.service';

/**
 * Assessment overhaul (Quiz -> Assessment, see the plan doc): a new,
 * parallel bounded context — deliberately NOT the existing (singular)
 * `modules/assessment/` (assignments + legacy quizzes), which stays
 * untouched. Imports DeliveryModule for MaterialsRepository (online
 * question generation reads an already-uploaded material, same as the
 * legacy AI quiz generator) and AssessmentAiModule for the
 * Gemini-backed AssessmentAiService.
 * Owns tables: assessments, assessment_batches, assessment_questions,
 * assessment_results, assessment_scorecard_imports.
 */
@Module({
  imports: [
    IdentityModule,
    SchedulingModule,
    NotificationsModule,
    DeliveryModule,
    StorageModule,
    AssessmentAiModule,
  ],
  controllers: [OnlineAssessmentsController, OfflineAssessmentsController],
  providers: [
    AssessmentsRepository,
    AssessmentsService,
    OnlineAssessmentsService,
    OfflineAssessmentsService,
    ScorecardTemplateService,
    ScorecardImportService,
    AssessmentSchedulerService,
  ],
  exports: [
    AssessmentsRepository,
    AssessmentsService,
    OnlineAssessmentsService,
    OfflineAssessmentsService,
  ],
})
export class AssessmentsModule {}
