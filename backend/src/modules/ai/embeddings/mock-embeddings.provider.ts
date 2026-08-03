import { Injectable, Logger } from '@nestjs/common';
import type { EmbeddingsProvider } from './embeddings-provider.interface';
import { EMBEDDING_DIMENSIONS } from './embeddings-provider.interface';

/**
 * Selected when VOYAGE_API_KEY is unset — same shape as MockAiProvider:
 * a deterministic hashed bag-of-words vector, not random noise, so
 * cosine similarity still correlates with shared vocabulary and RAG
 * retrieval is genuinely testable pre-commercialization, not just a
 * stub that always returns nothing.
 */
@Injectable()
export class MockEmbeddingsProvider implements EmbeddingsProvider {
  private readonly logger = new Logger('Embeddings (dev)');

  embed(text: string): Promise<number[]> {
    this.logger.warn(
      'Generating MOCK embedding (VOYAGE_API_KEY unset — hashed bag-of-words, not real semantic search)',
    );

    const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
    const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    for (const token of tokens) {
      vector[hashToken(token) % EMBEDDING_DIMENSIONS] += 1;
    }

    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
    return Promise.resolve(vector.map((v) => v / norm));
  }
}

function hashToken(token: string): number {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    hash = (Math.imul(hash, 31) + token.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
