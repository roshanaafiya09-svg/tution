import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmbeddingsProvider } from './embeddings-provider.interface';
import { EMBEDDING_DIMENSIONS } from './embeddings-provider.interface';

const VOYAGE_ENDPOINT = 'https://api.voyageai.com/v1/embeddings';

interface VoyageResponse {
  data: { embedding: number[]; index: number }[];
}

/**
 * Real embeddings for the doubt solver's RAG retrieval. Claude has no
 * embeddings endpoint — Voyage AI is Anthropic's own recommended
 * embeddings partner, so it's the real provider here rather than a
 * second Anthropic call. No SDK dependency; Voyage's API is a single
 * plain REST endpoint.
 */
@Injectable()
export class VoyageEmbeddingsProvider implements EmbeddingsProvider {
  constructor(private readonly config: ConfigService) {}

  async embed(
    text: string,
    inputType: 'document' | 'query',
  ): Promise<number[]> {
    const apiKey = this.config.getOrThrow<string>('embeddings.apiKey');
    const model = this.config.get<string>('embeddings.model') ?? 'voyage-3';

    const response = await fetch(VOYAGE_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: text,
        model,
        input_type: inputType,
      }),
    });

    if (!response.ok) {
      throw new InternalServerErrorException(
        `Voyage embeddings request failed: ${response.status} ${await response.text()}`,
      );
    }

    const body = (await response.json()) as VoyageResponse;
    const embedding = body.data[0]?.embedding;
    if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new InternalServerErrorException(
        `Voyage returned an embedding of unexpected length (expected ${EMBEDDING_DIMENSIONS})`,
      );
    }
    return embedding;
  }
}
