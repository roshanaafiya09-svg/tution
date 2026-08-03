import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { AI_PROVIDER } from './ai-provider.interface';
import { MockAiProvider } from './mock-ai.provider';
import { ClaudeAiProvider } from './claude-ai.provider';

const aiLogger = new Logger('AiModule');

/**
 * Bounded context: AI-assisted features, all routed through Claude with
 * model IDs/pricing in server config (never hardcoded, never client-side
 * — blueprint §8). Same env-gated provider-selection shape as
 * AnalyticsModule/IdentityModule's OTP provider: ANTHROPIC_API_KEY unset
 * -> MockAiProvider, a working templated stand-in (not an error) so
 * every caller can be built and live-tested pre-commercialization.
 * Phase 2: AI weekly parent digest (digests/ subfolder). Quiz generator
 * still to come. Phase 3 adds the RAG doubt solver (pgvector).
 */
@Module({
  providers: [
    MockAiProvider,
    ClaudeAiProvider,
    {
      provide: AI_PROVIDER,
      inject: [ConfigService, MockAiProvider, ClaudeAiProvider],
      useFactory: (
        config: ConfigService,
        mock: MockAiProvider,
        claude: ClaudeAiProvider,
      ) => {
        const configured = Boolean(config.get<string>('ai.apiKey'));
        if (configured) {
          aiLogger.log('Claude configured — AI features enabled');
          return claude;
        }
        aiLogger.warn(
          'ANTHROPIC_API_KEY not set — AI endpoints return templated mock output, not real Claude',
        );
        return mock;
      },
    },
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}
