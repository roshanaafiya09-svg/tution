import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { DeliveryModule } from '../../delivery/delivery.module';
import { AiModule } from '../ai.module';
import { QuizzesController } from './quizzes.controller';
import { QuizzesService } from './quizzes.service';
import { QuizzesRepository } from './quizzes.repository';

/**
 * Bounded context: AI quiz generator (blueprint §8, §10 Phase 2). A
 * sink module like Digests — imports DeliveryModule (MaterialsRepository
 * + STORAGE_PROVIDER, to load the PDF a draft is generated from) and
 * AiModule (the generation call); nothing imports this back. Ownership
 * checks use materials.tutor_id directly, so no SchedulingModule import
 * is needed here.
 * Owns tables: quiz_drafts, quiz_draft_questions.
 */
@Module({
  imports: [IdentityModule, DeliveryModule, AiModule],
  controllers: [QuizzesController],
  providers: [QuizzesService, QuizzesRepository],
})
export class QuizzesModule {}
