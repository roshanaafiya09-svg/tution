import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type {
  AiProvider,
  DigestNarrativeInput,
  QuizQuestionDraft,
} from './ai-provider.interface';

const MAX_NARRATIVE_TOKENS = 400;
const MAX_QUIZ_TOKENS = 3000;
/** Bounds cost/latency on very large PDFs — 10 good MCQs don't need the
 *  whole chapter, and blueprint §8 hard-caps AI cost per active student. */
const MAX_MATERIAL_CHARS = 15_000;

/**
 * Always instantiated by Nest even when the factory doesn't select it,
 * mirroring PosthogAnalyticsProvider/FcmPushProvider — the SDK client is
 * built lazily on first call, not in the constructor.
 */
@Injectable()
export class ClaudeAiProvider implements AiProvider {
  private client: Anthropic | null = null;

  constructor(private readonly config: ConfigService) {}

  private getClient(): Anthropic {
    if (this.client) return this.client;
    this.client = new Anthropic({
      apiKey: this.config.getOrThrow<string>('ai.apiKey'),
    });
    return this.client;
  }

  async generateDigestNarrative(input: DigestNarrativeInput): Promise<string> {
    const model = this.config.get<string>('ai.model') ?? 'claude-sonnet-5';
    const response = await this.getClient().messages.create({
      model,
      max_tokens: MAX_NARRATIVE_TOKENS,
      messages: [{ role: 'user', content: buildDigestPrompt(input) }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new InternalServerErrorException(
        'AI digest generation returned no text content',
      );
    }
    return textBlock.text.trim();
  }

  async generateQuizQuestions(
    materialText: string,
    count: number,
  ): Promise<QuizQuestionDraft[]> {
    const model = this.config.get<string>('ai.model') ?? 'claude-sonnet-5';
    const response = await this.getClient().messages.create({
      model,
      max_tokens: MAX_QUIZ_TOKENS,
      messages: [
        { role: 'user', content: buildQuizPrompt(materialText, count) },
      ],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new InternalServerErrorException(
        'AI quiz generation returned no text content',
      );
    }

    return parseQuizQuestions(textBlock.text);
  }
}

/** Never assume it will reach a student unreviewed — the prompt itself
 *  states the review gate so the model doesn't write as if addressing
 *  students directly (blueprint §8: "tutor must review and approve"). */
function buildQuizPrompt(materialText: string, count: number): string {
  const truncated = materialText.slice(0, MAX_MATERIAL_CHARS);
  return `You are drafting a multiple-choice quiz for a tutor to review and edit before it is ever shown to any student — nothing you write here reaches a student unreviewed.

Based ONLY on the study material below, write exactly ${count} multiple-choice questions covering distinct concepts from the material. Do not invent facts not present in the material. Each question needs exactly 4 answer choices with exactly one correct answer, and a difficulty rating.

Respond with ONLY a JSON array, no other text, no markdown code fence, matching exactly this shape:
[{"questionText": string, "choices": [string, string, string, string], "correctChoiceIndex": number (0-3), "difficulty": "easy" | "medium" | "hard"}]

Study material:
"""
${truncated}
"""`;
}

function parseQuizQuestions(raw: string): QuizQuestionDraft[] {
  let parsed: unknown;
  try {
    // Models occasionally wrap JSON in a code fence despite instructions.
    const jsonText = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    parsed = JSON.parse(jsonText);
  } catch {
    throw new InternalServerErrorException(
      'AI quiz generation returned malformed JSON',
    );
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new InternalServerErrorException(
      'AI quiz generation returned no questions',
    );
  }

  return parsed.map((item, index) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof (item as Record<string, unknown>).questionText !== 'string' ||
      !Array.isArray((item as Record<string, unknown>).choices) ||
      (item as { choices: unknown[] }).choices.length !== 4 ||
      typeof (item as Record<string, unknown>).correctChoiceIndex !==
        'number' ||
      !['easy', 'medium', 'hard'].includes(
        (item as Record<string, unknown>).difficulty as string,
      )
    ) {
      throw new InternalServerErrorException(
        `AI quiz generation returned a malformed question at index ${index}`,
      );
    }
    const q = item as {
      questionText: string;
      choices: string[];
      correctChoiceIndex: number;
      difficulty: 'easy' | 'medium' | 'hard';
    };
    if (q.correctChoiceIndex < 0 || q.correctChoiceIndex > 3) {
      throw new InternalServerErrorException(
        `AI quiz generation returned an out-of-range correctChoiceIndex at index ${index}`,
      );
    }
    return q;
  });
}

/**
 * Only the child's first name and this week's already-computed stats go
 * in — no phone numbers, IDs, or other students' data. Blueprint §8's
 * "student names tokenised" guardrail targets shared/multi-student
 * contexts (quiz gen, doubt solver); a digest is inherently addressed
 * to one parent about their own child, so using the real name here is
 * the point, not a PII leak.
 */
function buildDigestPrompt(input: DigestNarrativeInput): string {
  const languageName = input.locale === 'ta' ? 'Tamil' : 'English';
  const gradesLine =
    input.grades.length === 0
      ? 'No graded work this period.'
      : input.grades
          .map((g) => `${g.assignmentTitle} (${g.batchTitle}): ${g.grade}`)
          .join('; ');

  return `You are writing a short weekly progress update for a parent about their child's tuition classes, for a tutoring app used in Chennai, India.

Write ONE short paragraph (3-4 sentences) in ${languageName}. Be warm, specific, and factual — reference the actual numbers below. Do not invent any detail not given here. Do not add a greeting or sign-off, just the paragraph itself.

Child: ${input.studentDisplayName}
Period: ${input.periodStart} to ${input.periodEnd}
Attendance: ${input.attendance.present} present, ${input.attendance.late} late, ${input.attendance.absent} absent, out of ${input.attendance.total} scheduled classes${input.attendance.rate === null ? '' : ` (${input.attendance.rate}% attendance)`}.
Assignments: ${input.submissions.submitted} submitted, ${input.submissions.graded} graded.
Grades this period: ${gradesLine}`;
}
