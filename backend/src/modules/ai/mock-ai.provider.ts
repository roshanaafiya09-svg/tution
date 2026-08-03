import { Injectable, Logger } from '@nestjs/common';
import type {
  AiProvider,
  DigestNarrativeInput,
  DoubtSolverCallResult,
  DoubtSolverChunk,
  ModerationResult,
  QuizQuestionDraft,
} from './ai-provider.interface';

/** Same rough chars-per-token heuristic used to eyeball English text
 *  cost everywhere in this codebase's comments — good enough for the
 *  mock provider's token-budget bookkeeping; the real provider reports
 *  Anthropic's actual usage figures instead. */
const CHARS_PER_TOKEN = 4;
const BANNED_KEYWORDS = ['kill myself', 'suicide', 'self harm', 'self-harm'];

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

  /** No real reasoning — surfaces the single best-matching retrieved
   *  chunk (already ranked by the caller's vector search) as a pointer,
   *  never a worked answer. Good enough to prove the Socratic-gate
   *  plumbing end to end; real hint quality comes from Claude. */
  generateDoubtHint(
    question: string,
    chunks: DoubtSolverChunk[],
  ): Promise<DoubtSolverCallResult> {
    this.logger.warn(
      `Generating MOCK doubt hint (ANTHROPIC_API_KEY unset — pointer to source material, not a real hint)`,
    );

    const top = chunks[0];
    const text = top
      ? `Here's a pointer, not the answer: re-read "${top.materialTitle}" — the part starting "${snippet(top.content)}" is directly relevant to your question. Work through it, then send me your own attempt at an answer and I'll help you check it.`
      : `I couldn't find anything in this batch's materials about "${question}" — ask your tutor directly.`;

    return Promise.resolve({
      text,
      inputTokens: estimateTokens(
        question + chunks.map((c) => c.content).join(''),
      ),
      outputTokens: estimateTokens(text),
    });
  }

  /** Templated, not reasoned — echoes the top chunk's content back as
   *  an "explanation" alongside a canned acknowledgement of the
   *  student's attempt. Real synthesis comes from Claude. */
  generateDoubtAnswer(
    question: string,
    studentAttempt: string,
    chunks: DoubtSolverChunk[],
  ): Promise<DoubtSolverCallResult> {
    this.logger.warn(
      `Generating MOCK doubt answer (ANTHROPIC_API_KEY unset — templated, not reasoned)`,
    );

    const top = chunks[0];
    const text = top
      ? `Nice work attempting it. Based on "${top.materialTitle}": ${snippet(top.content, 400)} That's the core idea behind your question — compare it against what you wrote and see where they line up.`
      : `I don't have source material to check your attempt against — ask your tutor to confirm.`;

    return Promise.resolve({
      text,
      inputTokens: estimateTokens(
        question + studentAttempt + chunks.map((c) => c.content).join(''),
      ),
      outputTokens: estimateTokens(text),
    });
  }

  /** Keyword-list check, not a real moderation model — flags an
   *  obvious, narrow list of self-harm phrasing so the pipeline (flag ->
   *  block RAG call -> "ask your tutor") is genuinely exercisable
   *  pre-commercialization. Real moderation comes from a small Claude
   *  model, per blueprint §8. */
  moderateQuestion(question: string): Promise<ModerationResult> {
    const lower = question.toLowerCase();
    const hit = BANNED_KEYWORDS.find((kw) => lower.includes(kw));
    return Promise.resolve(
      hit
        ? { flagged: true, reason: `Contains flagged phrase: "${hit}"` }
        : { flagged: false, reason: null },
    );
  }
}

function snippet(text: string, maxLength = 160): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return trimmed.length > maxLength
    ? `${trimmed.slice(0, maxLength)}...`
    : trimmed;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
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
