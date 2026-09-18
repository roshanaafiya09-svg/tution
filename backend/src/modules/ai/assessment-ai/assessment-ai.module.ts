import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssessmentAiService } from './assessment-ai.service';
import { ASSESSMENT_AI_PROVIDER } from './assessment-ai-provider.interface';
import { MockAssessmentAiProvider } from './mock-assessment-ai.provider';
import { GeminiAssessmentAiProvider } from './gemini-assessment-ai.provider';

const logger = new Logger('AssessmentAiModule');

/**
 * Same env-gated provider-selection shape as AiModule (../ai.module.ts):
 * GOOGLE_GEMINI_API_KEY unset -> MockAssessmentAiProvider (a working
 * templated stand-in, not an error), set -> GeminiAssessmentAiProvider.
 * Deliberately its own module/token/interface, not a Gemini branch bolted
 * onto AiModule's Claude-based AiProvider — see the Assessment overhaul
 * plan's "AI provider separation" rationale.
 */
@Module({
  providers: [
    MockAssessmentAiProvider,
    GeminiAssessmentAiProvider,
    {
      provide: ASSESSMENT_AI_PROVIDER,
      inject: [
        ConfigService,
        MockAssessmentAiProvider,
        GeminiAssessmentAiProvider,
      ],
      useFactory: (
        config: ConfigService,
        mock: MockAssessmentAiProvider,
        gemini: GeminiAssessmentAiProvider,
      ) => {
        const configured = Boolean(
          config.get<string>('aiAssessment.geminiApiKey'),
        );
        if (configured) {
          logger.log('Gemini configured — Assessment AI features enabled');
          return gemini;
        }
        logger.warn(
          'GOOGLE_GEMINI_API_KEY not set — Assessment AI endpoints return templated mock output, not real Gemini',
        );
        return mock;
      },
    },
    AssessmentAiService,
  ],
  exports: [AssessmentAiService],
})
export class AssessmentAiModule {}
