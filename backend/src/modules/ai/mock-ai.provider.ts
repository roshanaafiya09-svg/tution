import { Injectable, Logger } from '@nestjs/common';
import type {
  AiProvider,
  DigestNarrativeInput,
  QuizQuestionDraft,
} from './ai-provider.interface';

const DIFFICULTIES: QuizQuestionDraft['difficulty'][] = [
  'easy',
  'medium',
  'hard',
];
const MIN_WORD_LENGTH = 5;

/**
 * Selected by AiModule's factory when ANTHROPIC_API_KEY is unset — same
 * "working stand-in, not an error" shape as the console OTP provider,
 * the noop analytics provider, and the local-disk storage fallback used
 * elsewhere in this codebase. Lets every caller of AiService (digest
 * generation, later the quiz generator) be built and live-tested against
 * real Postgres data end-to-end before a Claude key exists. The stats
 * themselves are always real — only the prose is templated, not AI.
 * Swap to real output at commercialization time by setting
 * ANTHROPIC_API_KEY; no other code changes.
 */
@Injectable()
export class MockAiProvider implements AiProvider {
  private readonly logger = new Logger('AI (mock)');

  async generateDigestNarrative(input: DigestNarrativeInput): Promise<string> {
    this.logger.warn(
      `Generating MOCK digest narrative for ${input.studentDisplayName} (ANTHROPIC_API_KEY unset — not real Claude output)`,
    );
    return input.locale === 'ta'
      ? this.narrativeTa(input)
      : this.narrativeEn(input);
  }

  private narrativeEn(input: DigestNarrativeInput): string {
    const {
      studentDisplayName,
      periodStart,
      periodEnd,
      attendance,
      submissions,
      grades,
    } = input;

    const attendedCount = attendance.present + attendance.late;
    const attendanceLine =
      attendance.total > 0
        ? `attended ${attendedCount} of ${attendance.total} classes (${attendance.rate}%)`
        : 'had no scheduled classes';

    const submissionLine =
      submissions.submitted > 0
        ? `submitted ${submissions.submitted} assignment${submissions.submitted === 1 ? '' : 's'}, with ${submissions.graded} graded so far`
        : 'submitted no assignments';

    const gradesLine =
      grades.length > 0
        ? ` Recent grades: ${grades.map((g) => `${g.assignmentTitle} (${g.batchTitle}): ${g.grade}`).join(', ')}.`
        : '';

    return `This week (${periodStart} to ${periodEnd}), ${studentDisplayName} ${attendanceLine} and ${submissionLine}.${gradesLine}`;
  }

  /** Rough placeholder phrasing for testing only — not reviewed by a
   *  Tamil speaker. Real Tamil output comes from Claude once configured. */
  private narrativeTa(input: DigestNarrativeInput): string {
    const {
      studentDisplayName,
      periodStart,
      periodEnd,
      attendance,
      submissions,
    } = input;
    const attendedCount = attendance.present + attendance.late;

    const attendanceLine =
      attendance.total > 0
        ? `${attendance.total} வகுப்புகளில் ${attendedCount} கலந்துகொண்டார் (${attendance.rate}%)`
        : 'இந்த வாரம் வகுப்புகள் எதுவும் இல்லை';

    return `இந்த வாரம் (${periodStart} முதல் ${periodEnd} வரை), ${studentDisplayName} ${attendanceLine}, மேலும் ${submissions.submitted} பணிகளை சமர்ப்பித்தார் (${submissions.graded} மதிப்பீடு செய்யப்பட்டது).`;
  }

  /** No real comprehension of the material — this is a fill-in-the-
   *  blank generator, not a question generator. It blanks out the
   *  longest word in a handful of sentences and offers other words
   *  from the material as decoys. Good enough to prove the whole
   *  pipeline (PDF extraction -> generation -> tutor review/approval)
   *  end to end; real question quality comes from Claude once
   *  configured — this is not a preview of that. */
  async generateQuizQuestions(
    materialText: string,
    count: number,
  ): Promise<QuizQuestionDraft[]> {
    this.logger.warn(
      `Generating ${count} MOCK quiz questions (ANTHROPIC_API_KEY unset — fill-in-the-blank, not real questions)`,
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

    const questions: QuizQuestionDraft[] = [];
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
        difficulty: DIFFICULTIES[questions.length % DIFFICULTIES.length],
      });
    }

    return questions;
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
