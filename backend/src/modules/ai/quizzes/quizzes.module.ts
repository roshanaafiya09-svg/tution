import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { DeliveryModule } from '../../delivery/delivery.module';
import { AiModule } from '../ai.module';
import { QuizzesController } from './quizzes.controller';
import { QuizzesService } from './quizzes.service';
import { QuizzesRepository } from './quizzes.repository';

/**
 * Bounded context: AI quiz generator (blueprint §8, §10 Phase 2). Imports
 * DeliveryModule (MaterialsRepository + STORAGE_PROVIDER, to load the PDF
 * a draft is generated from) and AiModule (the generation call).
 * Ownership checks use materials.tutor_id directly, so no SchedulingModule
 * import is needed here. Exports QuizzesRepository so the assessment
 * module's Phase 3 student-quiz-taking flow can read an approved draft
 * to publish it — that's the one thing that imports this back.
 * Owns tables: quiz_drafts, quiz_draft_questions.
 */
@Module({
  imports: [IdentityModule, DeliveryModule, AiModule],
  controllers: [QuizzesController],
  providers: [QuizzesService, QuizzesRepository],
  exports: [QuizzesRepository],
})
export class QuizzesModule {}
