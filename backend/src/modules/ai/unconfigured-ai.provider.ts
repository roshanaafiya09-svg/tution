import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AiProvider, DigestNarrativeInput } from './ai-provider.interface';

/** Selected by AiModule's factory when ANTHROPIC_API_KEY is unset — same
 *  "503 until configured" shape as GoogleAuthService, not a silent noop,
 *  since there's no honest stand-in for AI-generated content. */
@Injectable()
export class UnconfiguredAiProvider implements AiProvider {
  generateDigestNarrative(_input: DigestNarrativeInput): Promise<string> {
    throw new ServiceUnavailableException(
      'AI features are not configured on this server (ANTHROPIC_API_KEY missing).',
    );
  }
}
