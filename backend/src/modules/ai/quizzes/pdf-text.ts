import { BadRequestException } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';

const MIN_EXTRACTED_CHARS = 200;

// SEC-07: uploads go client → Supabase directly via a presigned URL —
// the backend never sees the bytes at upload time, only a client-
// declared `mime` string it trusts. This is the one place mislabeled
// bytes actually reach the server (both the doubt-solver indexer and
// the quiz generator route their material read here) rather than just
// a browser rendering/downloading them, so it's the one place worth a
// real check: handing arbitrary, attacker-controlled bytes to a PDF
// parser (which the mime field alone did nothing to prevent) is a
// genuine attack surface (parser bugs — see SEC-13), not just a
// labeling nicety. A real PDF always starts with the `%PDF-` magic
// bytes; rejecting anything else before it reaches the parser closes
// that off cheaply.
const PDF_MAGIC_BYTES = Buffer.from('%PDF-', 'ascii');

function looksLikePdf(buffer: Buffer): boolean {
  return buffer.subarray(0, PDF_MAGIC_BYTES.length).equals(PDF_MAGIC_BYTES);
}

/** Extracts plain text from a PDF's raw bytes — the AI quiz generator
 *  (blueprint §8) only ever sees this extracted text, never the file
 *  itself. Scanned/image-only PDFs correctly fail here rather than
 *  silently producing a quiz from an empty string. */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  if (!looksLikePdf(buffer)) {
    throw new BadRequestException(
      'This file is not a valid PDF — it may be corrupted or mislabeled.',
    );
  }

  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = result.text.trim();
    if (text.length < MIN_EXTRACTED_CHARS) {
      throw new BadRequestException(
        'Could not extract enough text from this PDF — it may be scanned/image-only or empty.',
      );
    }
    return text;
  } finally {
    await parser.destroy();
  }
}
