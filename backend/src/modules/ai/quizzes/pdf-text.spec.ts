import { BadRequestException } from '@nestjs/common';
import { extractPdfText } from './pdf-text';

/**
 * SEC-07: uploads never pass through the backend at upload time (client
 * → Supabase direct, presigned URL) — the declared `mime` is trusted at
 * that point. extractPdfText is the one place mislabeled bytes actually
 * reach server-side code (both the doubt-solver indexer and the quiz
 * generator read a material's bytes and hand them straight here), so
 * it's the one place a magic-byte check earns its keep: rejecting
 * anything that isn't genuinely PDF-shaped before it reaches the parser
 * library itself.
 */
describe('extractPdfText — magic-byte gate (SEC-07)', () => {
  it('rejects a buffer with no PDF magic bytes before ever invoking the parser', async () => {
    const notAPdf = Buffer.from('this is just plain text, not a PDF at all');

    await expect(extractPdfText(notAPdf)).rejects.toThrow(/not a valid PDF/);
  });

  it("rejects a file with another format's real magic bytes (e.g. a PNG) the same way", async () => {
    const pngMagicBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    await expect(extractPdfText(pngMagicBytes)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(extractPdfText(pngMagicBytes)).rejects.toThrow(
      /not a valid PDF/,
    );
  });

  it('lets genuinely PDF-signed bytes reach the parser instead of rejecting them at the gate', async () => {
    // Real "%PDF-" magic bytes, but not a structurally complete PDF —
    // this should fail differently (the parser's own error, or the
    // "not enough text" check below it), never the magic-byte message,
    // proving the gate isn't just rejecting everything.
    const pdfShaped = Buffer.from('%PDF-1.4\n%%EOF');

    await expect(extractPdfText(pdfShaped)).rejects.not.toThrow(
      /not a valid PDF/,
    );
  });
});
