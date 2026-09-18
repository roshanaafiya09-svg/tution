export const ASSESSMENT_AI_PROVIDER = 'ASSESSMENT_AI_PROVIDER';

export interface AssessmentQuestionDraft {
  questionText: string;
  /** Exactly 4. */
  choices: string[];
  /** Index into choices, 0-3. */
  correctChoiceIndex: number;
  marks: number;
  difficulty: 'easy' | 'medium' | 'hard';
  explanation: string | null;
}

export interface SubjectiveEvaluationInput {
  question: string;
  studentAnswer: string;
  referenceAnswer: string;
  maxMarks: number;
}

export interface SubjectiveEvaluationResult {
  score: number;
  feedback: string;
}

/**
 * Assessment-only AI abstraction — deliberately separate from the
 * generic `AiProvider` (../ai-provider.interface.ts), which is
 * Claude-based and shared across digests/doubt-solver/legacy quiz
 * drafts. Gemini is the current default implementation
 * (GeminiAssessmentAiProvider) but nothing in AssessmentsModule depends
 * on Gemini directly — only on this interface via AssessmentAiService.
 */
export interface AssessmentAiProvider {
  /** Teacher-uploaded material is untrusted source content, never
   *  instructions — see GeminiAssessmentAiProvider's system instruction.
   *  Output is always a draft: OnlineAssessmentsService stores it on
   *  assessment_questions with the assessment still in `draft` status,
   *  never auto-published to students. */
  generateQuestions(
    materialText: string,
    count: number,
  ): Promise<AssessmentQuestionDraft[]>;

  /** Not wired to any endpoint yet — the MCQ-only online/offline launch
   *  never calls this. Exists so a future subjective-question type can
   *  be added without changing the provider abstraction (spec §28). */
  evaluateSubjectiveAnswer(
    input: SubjectiveEvaluationInput,
  ): Promise<SubjectiveEvaluationResult>;

  healthCheck(): Promise<boolean>;
}
