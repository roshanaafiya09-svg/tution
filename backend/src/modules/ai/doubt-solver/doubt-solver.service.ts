import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MaterialChunksRepository } from './material-chunks.repository';
import type { NewChunk } from './material-chunks.repository';
import { AiInteractionsRepository } from './interactions.repository';
import { chunkText } from './chunk-text';
import { scrubPii } from './pii-scrub';
import { MaterialsRepository } from '../../delivery/materials/materials.repository';
import { STORAGE_PROVIDER } from '../../../common/storage/storage-provider.interface';
import type { StorageProvider } from '../../../common/storage/storage-provider.interface';
import { BatchesRepository } from '../../scheduling/batches/batches.repository';
import { AnalyticsService } from '../../analytics/analytics.service';
import { AiService } from '../ai.service';
import { EMBEDDINGS_PROVIDER } from '../embeddings/embeddings-provider.interface';
import type { EmbeddingsProvider } from '../embeddings/embeddings-provider.interface';
import { extractPdfText } from '../quizzes/pdf-text';
import type { DoubtSolverChunk } from '../ai-provider.interface';
import type { AiInteractionCitation, DB } from '../../../database/types';
import type { Selectable } from 'kysely';

const DEFAULT_MONTHLY_TOKEN_CAP = 200_000;

@Injectable()
export class DoubtSolverService {
  constructor(
    private readonly chunksRepository: MaterialChunksRepository,
    private readonly interactions: AiInteractionsRepository,
    private readonly materialsRepository: MaterialsRepository,
    private readonly batchesRepository: BatchesRepository,
    private readonly aiService: AiService,
    private readonly analytics: AnalyticsService,
    private readonly config: ConfigService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(EMBEDDINGS_PROVIDER)
    private readonly embeddings: EmbeddingsProvider,
  ) {}

  /** Tutor-triggered, mirroring the quiz generator's on-demand
   *  generate call — no automatic upload-time indexing. Re-indexing
   *  replaces a material's chunks wholesale. */
  async indexMaterial(tutorId: string, materialId: string) {
    const material = await this.materialsRepository.findById(materialId);
    if (!material) throw new NotFoundException('Material not found');
    if (material.tutor_id !== tutorId) {
      throw new ForbiddenException('Not your material');
    }
    if (material.mime !== 'application/pdf') {
      throw new BadRequestException(
        'Only PDF materials can be indexed for the doubt solver right now',
      );
    }

    const fileBytes = await this.storage.read(material.object_key);
    const text = await extractPdfText(fileBytes);
    const pieces = chunkText(text);
    if (pieces.length === 0) {
      throw new BadRequestException('No text to index from this material');
    }

    const embedded: NewChunk[] = [];
    for (const content of pieces) {
      const embedding = await this.embeddings.embed(content, 'document');
      embedded.push({ content, embedding });
    }

    await this.chunksRepository.replaceForMaterial(
      materialId,
      material.batch_id,
      tutorId,
      embedded,
    );

    this.analytics.capture(tutorId, 'material_indexed_for_doubt_solver', {
      materialId,
      batchId: material.batch_id,
      chunkCount: embedded.length,
    });

    return { materialId, chunkCount: embedded.length };
  }

  /** First turn of the Socratic gate: always a hint, never the answer —
   *  enforced structurally by this method only ever calling
   *  generateDoubtHint, never generateDoubtAnswer. */
  async ask(studentId: string, batchId: string, rawQuestion: string) {
    await this.assertEnrolled(studentId, batchId);
    await this.assertUnderBudget(studentId);

    const question = scrubPii(rawQuestion);

    const moderation = await this.aiService.moderateQuestion(question);
    if (moderation.flagged) {
      const flaggedInteraction = await this.interactions.create({
        studentId,
        batchId,
        parentId: null,
        kind: 'hint',
        questionText: question,
        answerText:
          "Your question couldn't be processed automatically — please ask your tutor directly.",
        citations: [],
        flagged: true,
        inputTokens: 0,
        outputTokens: 0,
      });
      this.analytics.capture(studentId, 'doubt_question_flagged', {
        batchId,
        reason: moderation.reason,
      });
      return toResponse(flaggedInteraction);
    }

    const queryEmbedding = await this.embeddings.embed(question, 'query');
    const matches = await this.chunksRepository.searchByBatch(
      batchId,
      queryEmbedding,
    );
    const chunks: DoubtSolverChunk[] = matches.map((m) => ({
      materialId: m.material_id,
      materialTitle: m.material_title,
      chunkIndex: m.chunk_index,
      content: m.content,
    }));

    const result = await this.aiService.generateDoubtHint(question, chunks);
    const citations = toCitations(chunks);

    const interaction = await this.interactions.createIfUnderBudget(
      {
        studentId,
        batchId,
        parentId: null,
        kind: 'hint',
        questionText: question,
        answerText: result.text,
        citations,
        flagged: false,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
      this.monthlyTokenCap(),
    );
    if (!interaction) this.throwOverBudget();

    this.analytics.capture(studentId, 'doubt_question_asked', {
      batchId,
      chunkCount: chunks.length,
    });

    return toResponse(interaction);
  }

  /** Second turn: only reachable once the student has submitted their
   *  own attempt, and only once per question — this is the server-side
   *  half of the Socratic gate (the other half is generateDoubtHint
   *  structurally having no way to return a full answer). Re-grounds
   *  the answer in the exact chunks the hint cited, not a fresh search. */
  async submitAttempt(
    studentId: string,
    hintId: string,
    rawAttemptText: string,
  ) {
    const hint = await this.interactions.findOpenHint(hintId);
    if (!hint) throw new NotFoundException('Question not found');
    if (hint.student_id !== studentId) {
      throw new ForbiddenException('Not your question');
    }
    if (hint.flagged) {
      throw new BadRequestException(
        'This question was flagged and has no follow-up — ask your tutor',
      );
    }
    if (await this.interactions.hasFollowUp(hintId)) {
      throw new BadRequestException(
        'You already received a full answer for this question',
      );
    }

    await this.assertUnderBudget(studentId);

    const attemptText = scrubPii(rawAttemptText);
    const refetched = await this.chunksRepository.findByRefs(
      hint.citations.map((c) => ({
        materialId: c.materialId,
        chunkIndex: c.chunkIndex,
      })),
    );
    const chunks: DoubtSolverChunk[] = refetched.map((c) => ({
      materialId: c.material_id,
      materialTitle: c.material_title,
      chunkIndex: c.chunk_index,
      content: c.content,
    }));

    const result = await this.aiService.generateDoubtAnswer(
      hint.question_text,
      attemptText,
      chunks,
    );

    const answer = await this.interactions.createIfUnderBudget(
      {
        studentId,
        batchId: hint.batch_id,
        parentId: hint.id,
        kind: 'full_answer',
        questionText: hint.question_text,
        answerText: result.text,
        citations: toCitations(chunks),
        flagged: false,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
      this.monthlyTokenCap(),
    );
    if (!answer) this.throwOverBudget();

    this.analytics.capture(studentId, 'doubt_answer_unlocked', {
      batchId: hint.batch_id,
      hintId,
    });

    return toResponse(answer);
  }

  async myHistory(studentId: string, batchId: string) {
    await this.assertEnrolled(studentId, batchId);
    const rows = await this.interactions.listForStudentInBatch(
      studentId,
      batchId,
    );
    // toResponse's generic awaitingAttempt flag can't see whether a
    // hint already has a follow-up — this list has the whole thread, so
    // derive it locally instead of a per-row query.
    const answeredHintIds = new Set(
      rows.filter((r) => r.parent_id !== null).map((r) => r.parent_id),
    );
    return rows.map((row) => ({
      ...toResponse(row),
      awaitingAttempt:
        row.kind === 'hint' && !row.flagged && !answeredHintIds.has(row.id),
    }));
  }

  private monthlyTokenCap(): number {
    return (
      this.config.get<number>('ai.doubtSolverMonthlyTokenCap') ??
      DEFAULT_MONTHLY_TOKEN_CAP
    );
  }

  private throwOverBudget(): never {
    throw new ForbiddenException(
      'Monthly AI usage limit reached for this account — ask your tutor directly, or try again next month',
    );
  }

  /** Cheap up-front fail-fast only — NOT the authoritative gate (see
   *  AiInteractionsRepository.createIfUnderBudget for that, called
   *  right before the write). This just avoids paying for an AI call
   *  that's obviously already over budget before it even starts;
   *  concurrent requests racing each other past this specific check is
   *  exactly the TOCTOU createIfUnderBudget's advisory lock closes. */
  private async assertUnderBudget(studentId: string): Promise<void> {
    const used = await this.interactions.monthlyTokenUsage(studentId);
    if (used >= this.monthlyTokenCap()) this.throwOverBudget();
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
}

function toCitations(chunks: DoubtSolverChunk[]): AiInteractionCitation[] {
  return chunks.map((c) => ({
    materialId: c.materialId,
    materialTitle: c.materialTitle,
    chunkIndex: c.chunkIndex,
  }));
}

function toResponse(row: Selectable<DB['ai_interactions']>) {
  return {
    id: row.id,
    kind: row.kind,
    questionText: row.question_text,
    answerText: row.answer_text,
    citations: row.citations,
    flagged: row.flagged,
    awaitingAttempt: row.kind === 'hint' && !row.flagged,
    createdAt: row.created_at,
  };
}
