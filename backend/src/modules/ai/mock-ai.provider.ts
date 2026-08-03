import { Injectable, Logger } from '@nestjs/common';
import type { AiProvider, DigestNarrativeInput } from './ai-provider.interface';

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
    const { studentDisplayName, periodStart, periodEnd, attendance, submissions, grades } =
      input;

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
    const { studentDisplayName, periodStart, periodEnd, attendance, submissions } = input;
    const attendedCount = attendance.present + attendance.late;

    const attendanceLine =
      attendance.total > 0
        ? `${attendance.total} வகுப்புகளில் ${attendedCount} கலந்துகொண்டார் (${attendance.rate}%)`
        : 'இந்த வாரம் வகுப்புகள் எதுவும் இல்லை';

    return `இந்த வாரம் (${periodStart} முதல் ${periodEnd} வரை), ${studentDisplayName} ${attendanceLine}, மேலும் ${submissions.submitted} பணிகளை சமர்ப்பித்தார் (${submissions.graded} மதிப்பீடு செய்யப்பட்டது).`;
  }
}
