const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;

/** Fixed-size sliding-window chunking with overlap — no sentence-
 *  boundary awareness, but simple, predictable, and good enough for
 *  embedding + retrieval at this scale. Revisit if retrieval quality
 *  on real materials turns out to need paragraph-aware splitting. */
export function chunkText(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) return [];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + CHUNK_SIZE, normalized.length);
    chunks.push(normalized.slice(start, end).trim());
    if (end === normalized.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks.filter((c) => c.length > 0);
}
