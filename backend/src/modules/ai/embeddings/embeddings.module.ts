import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMBEDDINGS_PROVIDER } from './embeddings-provider.interface';
import { MockEmbeddingsProvider } from './mock-embeddings.provider';
import { VoyageEmbeddingsProvider } from './voyage-embeddings.provider';

const embeddingsLogger = new Logger('EmbeddingsModule');

/**
 * Same env-gated provider-selection shape as AiModule: VOYAGE_API_KEY
 * unset -> MockEmbeddingsProvider (deterministic, not random), set ->
 * real Voyage calls. A sink module — DoubtSolverModule is the only
 * thing that imports this.
 */
@Module({
  providers: [
    MockEmbeddingsProvider,
    VoyageEmbeddingsProvider,
    {
      provide: EMBEDDINGS_PROVIDER,
      inject: [ConfigService, MockEmbeddingsProvider, VoyageEmbeddingsProvider],
      useFactory: (
        config: ConfigService,
        mock: MockEmbeddingsProvider,
        voyage: VoyageEmbeddingsProvider,
      ) => {
        const configured = Boolean(config.get<string>('embeddings.apiKey'));
        if (configured) {
          embeddingsLogger.log('Voyage configured — real embeddings enabled');
          return voyage;
        }
        embeddingsLogger.warn(
          'VOYAGE_API_KEY not set — doubt solver uses hashed mock embeddings, not real semantic search',
        );
        return mock;
      },
    },
  ],
  exports: [EMBEDDINGS_PROVIDER],
})
export class EmbeddingsModule {}
