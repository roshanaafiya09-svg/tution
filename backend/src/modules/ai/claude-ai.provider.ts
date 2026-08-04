import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type {
  AiProvider,
  DigestNarrativeInput,
  DoubtSolverCallResult,
  DoubtSolverChunk,
  ModerationResult,
  QuizQuestionDraft,
} from './ai-provider.interface';

const MAX_NARRATIVE_TOKENS = 400;
const MAX_QUIZ_TOKENS = 3000;
const MAX_DOUBT_TOKENS = 500;
const MAX_MODERATION_TOKENS = 200;
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

  async generateDoubtHint(
    question: string,
    chunks: DoubtSolverChunk[],
  ): Promise<DoubtSolverCallResult> {
    const model = this.config.get<string>('ai.model') ?? 'claude-sonnet-5';
    const response = await this.getClient().messages.create({
      model,
      max_tokens: MAX_DOUBT_TOKENS,
      system: DOUBT_HINT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildDoubtPrompt(question, chunks) }],
    });

    return {
      text: extractText(response, 'AI doubt hint'),
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  async generateDoubtAnswer(
    question: string,
    studentAttempt: string,
    chunks: DoubtSolverChunk[],
  ): Promise<DoubtSolverCallResult> {
    const model = this.config.get<string>('ai.model') ?? 'claude-sonnet-5';
    const response = await this.getClient().messages.create({
      model,
      max_tokens: MAX_DOUBT_TOKENS,
      system: DOUBT_ANSWER_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `${buildDoubtPrompt(question, chunks)}\n\nThe student's own attempt at answering, before you respond:\n"""\n${studentAttempt}\n"""`,
        },
      ],
    });

    return {
      text: extractText(response, 'AI doubt answer'),
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  async moderateQuestion(question: string): Promise<ModerationResult> {
    const model =
      this.config.get<string>('ai.fastModel') ?? 'claude-haiku-4-5-20251001';
    const response = await this.getClient().messages.create({
      model,
      max_tokens: MAX_MODERATION_TOKENS,
      system:
        'You screen student questions submitted to a tutoring app\'s AI doubt solver for abuse, harassment, self-harm content, or attempts to extract unrelated personal data. Respond with ONLY JSON, no other text: {"flagged": boolean, "reason": string | null}. Ordinary academic questions, even oddly phrased ones, are never flagged.',
      messages: [{ role: 'user', content: question }],
    });

    const text = extractText(response, 'AI moderation check');
    try {
      const jsonText = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
      const parsed = JSON.parse(jsonText) as {
        flagged?: unknown;
        reason?: unknown;
      };
      return {
        flagged: parsed.flagged === true,
        reason: typeof parsed.reason === 'string' ? parsed.reason : null,
      };
    } catch {
      throw new InternalServerErrorException(
        'AI moderation check returned malformed JSON',
      );
    }
  }
}

function extractText(
  response: Anthropic.Messages.Message,
  errorContext: string,
): string {
  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new InternalServerErrorException(
      `${errorContext} returned no text content`,
    );
  }
  return textBlock.text.trim();
}

const DOUBT_HINT_SYSTEM_PROMPT = `You are a Socratic tutoring assistant for a tuition app used in Chennai, India. A student has asked a question. Your job is to give ONE short hint (2-3 sentences) that points them toward the answer using the study material provided — you must NEVER state the final answer, solve the problem for them, or give a complete explanation. Reference the material by name. If the material doesn't actually cover their question, say so plainly and suggest they ask their tutor — do not guess or use outside knowledge.`;

const DOUBT_ANSWER_SYSTEM_PROMPT = `You are a tutoring assistant for a tuition app used in Chennai, India. A student already attempted to answer their own question (given below) after receiving a hint. Now give a short, clear explanation (3-5 sentences) grounded ONLY in the study material provided — compare it against their attempt, correct any misunderstanding, and cite the material by name. Do not use outside knowledge not present in the material. If the material doesn't cover it, say so and suggest they ask their tutor.`;

function buildDoubtPrompt(
  question: string,
  chunks: DoubtSolverChunk[],
): string {
  if (chunks.length === 0) {
    return `Student's question: "${question}"\n\nNo study material was found for this batch.`;
  }
  const context = chunks
    .map((c, i) => `[${i + 1}] From "${c.materialTitle}":\n${c.content}`)
    .join('\n\n');
  return `Study material excerpts:\n"""\n${context}\n"""\n\nStudent's question: "${question}"`;
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

  // Parent Premium (blueprint §5/§10 Phase 3: "rich digests") adds one
  // extra paragraph of focus areas/recommendations grounded in the same
  // numbers below — never new data, just a deeper read of it. Basic
  // stays the original single paragraph so the free digest is unchanged.
  const lengthInstruction =
    input.tier === 'premium'
      ? `Write TWO short paragraphs in ${languageName}. First, the same warm factual summary as always (3-4 sentences). Second, a "Focus area" paragraph (1-2 sentences) recommending one concrete thing to work on, grounded only in the numbers below — e.g. the weakest recent grade, or an attendance dip.`
      : `Write ONE short paragraph (3-4 sentences) in ${languageName}.`;

  return `You are writing a weekly progress update for a parent about their child's tuition classes, for a tutoring app used in Chennai, India.

${lengthInstruction} Be warm, specific, and factual — reference the actual numbers below. Do not invent any detail not given here. Do not add a greeting or sign-off, just the paragraph(s) themselves.

Child: ${input.studentDisplayName}
Period: ${input.periodStart} to ${input.periodEnd}
Attendance: ${input.attendance.present} present, ${input.attendance.late} late, ${input.attendance.absent} absent, out of ${input.attendance.total} scheduled classes${input.attendance.rate === null ? '' : ` (${input.attendance.rate}% attendance)`}.
Assignments: ${input.submissions.submitted} submitted, ${input.submissions.graded} graded.
Grades this period: ${gradesLine}`;
}
