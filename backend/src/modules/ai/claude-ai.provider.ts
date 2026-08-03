import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { AiProvider, DigestNarrativeInput } from './ai-provider.interface';

const MAX_NARRATIVE_TOKENS = 400;

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
