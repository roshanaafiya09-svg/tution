import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { AI_PROVIDER } from './ai-provider.interface';
import { UnconfiguredAiProvider } from './unconfigured-ai.provider';
import { ClaudeAiProvider } from './claude-ai.provider';

const aiLogger = new Logger('AiModule');

/**
 * Bounded context: AI-assisted features, all routed through Claude with
 * model IDs/pricing in server config (never hardcoded, never client-side
 * — blueprint §8). Same env-gated provider-selection shape as
 * AnalyticsModule: ANTHROPIC_API_KEY unset -> UnconfiguredAiProvider,
 * which 503s instead of faking output.
 * Phase 2: AI weekly parent digest (digests/ subfolder). Quiz generator
 * still to come. Phase 3 adds the RAG doubt solver (pgvector).
 */
@Module({
  providers: [
    UnconfiguredAiProvider,
    ClaudeAiProvider,
    {
      provide: AI_PROVIDER,
      inject: [ConfigService, UnconfiguredAiProvider, ClaudeAiProvider],
      useFactory: (
        config: ConfigService,
        unconfigured: UnconfiguredAiProvider,
        claude: ClaudeAiProvider,
      ) => {
        const configured = Boolean(config.get<string>('ai.apiKey'));
        if (configured) {
          aiLogger.log('Claude configured — AI features enabled');
          return claude;
        }
        aiLogger.warn(
          'ANTHROPIC_API_KEY not set — AI endpoints will return 503',
        );
        return unconfigured;
      },
    },
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}
