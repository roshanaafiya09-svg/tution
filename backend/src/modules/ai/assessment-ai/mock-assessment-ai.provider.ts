import { Injectable, Logger } from '@nestjs/common';
import type {
  AssessmentAiProvider,
  AssessmentQuestionDraft,
  SubjectiveEvaluationInput,
  SubjectiveEvaluationResult,
} from './assessment-ai-provider.interface';

const DIFFICULTIES: AssessmentQuestionDraft['difficulty'][] = [
  'easy',
  'medium',
  'hard',
];
const MIN_WORD_LENGTH = 5;
const DEFAULT_MARKS = 2;

/**
 * Selected by AssessmentAiModule's factory when GOOGLE_GEMINI_API_KEY is
 * unset — same "working stand-in, not an error" shape as MockAiProvider
 * (../mock-ai.provider.ts), whose fill-in-the-blank generation approach
 * this mirrors (small precedented duplication rather than sharing a
 * cross-module private method — see that file's own generateQuizQuestions).
 */
@Injectable()
export class MockAssessmentAiProvider implements AssessmentAiProvider {
  private readonly logger = new Logger('AssessmentAI (mock)');

  generateQuestions(
    materialText: string,
    count: number,
  ): Promise<AssessmentQuestionDraft[]> {
    this.logger.warn(
      `Generating ${count} MOCK assessment questions (GOOGLE_GEMINI_API_KEY unset — fill-in-the-blank, not real questions)`,
    );

    const sentences = materialText
      .replace(/\s+/g, ' ')
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.split(' ').length >= 6 && s.length <= 220);

    const vocabulary = Array.from(
      new Set(
        materialText.match(
          new RegExp(`\\b[A-Za-z]{${MIN_WORD_LENGTH},}\\b`, 'g'),
        ) ?? [],
      ),
    );

    const questions: AssessmentQuestionDraft[] = [];
    for (let i = 0; i < sentences.length && questions.length < count; i++) {
      const sentence = sentences[i];
      const sentenceWords: string[] =
        sentence.match(
          new RegExp(`\\b[A-Za-z]{${MIN_WORD_LENGTH},}\\b`, 'g'),
        ) ?? [];
      if (sentenceWords.length === 0) continue;

      const answer = sentenceWords.reduce((a, b) =>
        b.length > a.length ? b : a,
      );
      const blanked = sentence.replace(
        new RegExp(`\\b${escapeRegExp(answer)}\\b`),
        '_____',
      );

      const decoys = shuffle(
        vocabulary.filter((w) => w.toLowerCase() !== answer.toLowerCase()),
      ).slice(0, 3);
      while (decoys.length < 3) decoys.push(`option${decoys.length + 1}`);

      const choices = shuffle([answer, ...decoys]);
      questions.push({
        questionText: `Fill in the blank: "${blanked}"`,
        choices,
        correctChoiceIndex: choices.indexOf(answer),
        marks: DEFAULT_MARKS,
        difficulty: DIFFICULTIES[questions.length % DIFFICULTIES.length],
        explanation: `"${answer}" appears in the source material.`,
      });
    }

    return Promise.resolve(questions);
  }

  evaluateSubjectiveAnswer(
    input: SubjectiveEvaluationInput,
  ): Promise<SubjectiveEvaluationResult> {
    this.logger.warn(
      'Evaluating MOCK subjective answer (GOOGLE_GEMINI_API_KEY unset — length heuristic, not reasoned)',
    );
    const overlapWords = input.referenceAnswer
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= MIN_WORD_LENGTH);
    const answerLower = input.studentAnswer.toLowerCase();
    const matched = overlapWords.filter((w) => answerLower.includes(w)).length;
    const ratio = overlapWords.length === 0 ? 0 : matched / overlapWords.length;
    const score = Math.round(ratio * input.maxMarks);
    return Promise.resolve({
      score,
      feedback: `Mock evaluation: ${matched}/${overlapWords.length} key terms from the reference answer were present.`,
    });
  }

  healthCheck(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
