import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QuizzesRepository } from './quizzes.repository';
import { MaterialsRepository } from '../../delivery/materials/materials.repository';
import { STORAGE_PROVIDER } from '../../../common/storage/storage-provider.interface';
import type { StorageProvider } from '../../../common/storage/storage-provider.interface';
import { AiService } from '../ai.service';
import { AnalyticsService } from '../../analytics/analytics.service';
import { extractPdfText } from './pdf-text';
import type { UpdateQuizQuestionDto } from './dto/update-quiz-question.dto';

const DEFAULT_QUESTION_COUNT = 10;

/**
 * AI quiz generator (blueprint §8, §10 Phase 2): PDF material -> draft
 * MCQs -> tutor reviews/edits -> approve or reject. A draft is never
 * visible to a student by itself — this module only produces the
 * tutor-reviewed artifact; Phase 3's student-facing quiz-taking tables
 * (quizzes/quiz_attempts, blueprint §7) don't exist yet and would build
 * on top of an approved draft, not replace it.
 */
@Injectable()
export class QuizzesService {
  constructor(
    private readonly repository: QuizzesRepository,
    private readonly materialsRepository: MaterialsRepository,
    private readonly aiService: AiService,
    private readonly analytics: AnalyticsService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async generate(
    tutorId: string,
    materialId: string,
    count = DEFAULT_QUESTION_COUNT,
  ) {
    const material = await this.materialsRepository.findById(materialId);
    if (!material) throw new NotFoundException('Material not found');
    if (material.tutor_id !== tutorId) {
      throw new ForbiddenException('Not your material');
    }
    if (material.mime !== 'application/pdf') {
      throw new BadRequestException(
        'Quiz generation only supports PDF materials right now',
      );
    }

    const fileBytes = await this.storage.read(material.object_key);
    const materialText = await extractPdfText(fileBytes);

    const questions = await this.aiService.generateQuizQuestions(
      materialText,
      count,
    );
    if (questions.length === 0) {
      throw new BadRequestException(
        'AI generation produced no questions for this material',
      );
    }

    const draft = await this.repository.createDraftWithQuestions(
      tutorId,
      materialId,
      material.batch_id,
      questions,
    );

    this.analytics.capture(tutorId, 'quiz_draft_generated', {
      materialId,
      batchId: material.batch_id,
      questionCount: questions.length,
    });

    return this.getWithQuestions(tutorId, draft.id);
  }

  listForTutor(tutorId: string) {
    return this.repository.listForTutor(tutorId);
  }

  async getWithQuestions(tutorId: string, draftId: string) {
    const draft = await this.getOwnedDraft(tutorId, draftId);
    const questions = await this.repository.listQuestions(draft.id);
    return { ...draft, questions };
  }

  async updateQuestion(
    tutorId: string,
    draftId: string,
    questionId: string,
    dto: UpdateQuizQuestionDto,
  ) {
    const draft = await this.getOwnedDraft(tutorId, draftId);
    this.assertEditable(draft);

    const question = await this.repository.findQuestionById(questionId);
    if (!question || question.quiz_draft_id !== draft.id) {
      throw new NotFoundException('Question not found in this draft');
    }

    return this.repository.updateQuestion(questionId, dto);
  }

  /** Blueprint §8: "tutor must review and approve; never auto-publish
   *  AI content to students." This is that approval — nothing upstream
   *  of it treats a draft as usable. */
  async approve(tutorId: string, draftId: string) {
    const draft = await this.getOwnedDraft(tutorId, draftId);
    this.assertEditable(draft);
    const approved = await this.repository.updateStatus(draft.id, 'approved');
    this.analytics.capture(tutorId, 'quiz_draft_approved', {
      draftId: draft.id,
    });
    return approved;
  }

  async reject(tutorId: string, draftId: string) {
    const draft = await this.getOwnedDraft(tutorId, draftId);
    this.assertEditable(draft);
    const rejected = await this.repository.updateStatus(draft.id, 'rejected');
    this.analytics.capture(tutorId, 'quiz_draft_rejected', {
      draftId: draft.id,
    });
    return rejected;
  }

  private async getOwnedDraft(tutorId: string, draftId: string) {
    const draft = await this.repository.findById(draftId);
    if (!draft) throw new NotFoundException('Quiz draft not found');
    if (draft.tutor_id !== tutorId)
      throw new ForbiddenException('Not your quiz draft');
    return draft;
  }

  private assertEditable(draft: { status: string }): void {
    if (draft.status !== 'pending_review') {
      throw new BadRequestException(`This draft is already ${draft.status}`);
    }
  }
}
