import { Inject, Injectable } from '@nestjs/common';
import { ASSESSMENT_AI_PROVIDER } from './assessment-ai-provider.interface';
import type {
  AssessmentAiProvider,
  AssessmentQuestionDraft,
  SubjectiveEvaluationInput,
  SubjectiveEvaluationResult,
} from './assessment-ai-provider.interface';

/** Thin facade over the injected AssessmentAiProvider — the only thing
 *  AssessmentsModule depends on; it never sees GeminiAssessmentAiProvider
 *  or MockAssessmentAiProvider directly. */
@Injectable()
export class AssessmentAiService {
  constructor(
    @Inject(ASSESSMENT_AI_PROVIDER)
    private readonly provider: AssessmentAiProvider,
  ) {}

  generateQuestions(
    materialText: string,
    count: number,
  ): Promise<AssessmentQuestionDraft[]> {
    return this.provider.generateQuestions(materialText, count);
  }

  evaluateSubjectiveAnswer(
    input: SubjectiveEvaluationInput,
  ): Promise<SubjectiveEvaluationResult> {
    return this.provider.evaluateSubjectiveAnswer(input);
  }

  healthCheck(): Promise<boolean> {
    return this.provider.healthCheck();
  }
}
