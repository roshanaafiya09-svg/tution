/** Tied to material_chunks.embedding's column width (migration 0018) —
 *  every provider must return a vector of exactly this length. */
export const EMBEDDING_DIMENSIONS = 1024;

export const EMBEDDINGS_PROVIDER = Symbol('EMBEDDINGS_PROVIDER');

export interface EmbeddingsProvider {
  /** `inputType` mirrors Voyage's document/query distinction — pass
   *  'document' when indexing material chunks, 'query' when embedding a
   *  student's question, for better retrieval quality on the real
   *  provider. The mock ignores it. */
  embed(text: string, inputType: 'document' | 'query'): Promise<number[]>;
}
