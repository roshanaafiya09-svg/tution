import { Inject, Injectable } from '@nestjs/common';
import { AI_PROVIDER } from './ai-provider.interface';
import type {
  AiProvider,
  DigestNarrativeInput,
  DoubtSolverCallResult,
  DoubtSolverChunk,
  ModerationResult,
  QuizQuestionDraft,
} from './ai-provider.interface';

@Injectable()
export class AiService {
  constructor(@Inject(AI_PROVIDER) private readonly provider: AiProvider) {}

  generateDigestNarrative(input: DigestNarrativeInput): Promise<string> {
    return this.provider.generateDigestNarrative(input);
  }

  generateQuizQuestions(
    materialText: string,
    count: number,
  ): Promise<QuizQuestionDraft[]> {
    return this.provider.generateQuizQuestions(materialText, count);
  }

  generateDoubtHint(
    question: string,
    chunks: DoubtSolverChunk[],
  ): Promise<DoubtSolverCallResult> {
    return this.provider.generateDoubtHint(question, chunks);
  }

  generateDoubtAnswer(
    question: string,
    studentAttempt: string,
    chunks: DoubtSolverChunk[],
  ): Promise<DoubtSolverCallResult> {
    return this.provider.generateDoubtAnswer(question, studentAttempt, chunks);
  }

  moderateQuestion(question: string): Promise<ModerationResult> {
    return this.provider.moderateQuestion(question);
  }
}
