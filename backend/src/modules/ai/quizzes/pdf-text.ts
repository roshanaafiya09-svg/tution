import { BadRequestException } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';

const MIN_EXTRACTED_CHARS = 200;

/** Extracts plain text from a PDF's raw bytes — the AI quiz generator
 *  (blueprint §8) only ever sees this extracted text, never the file
 *  itself. Scanned/image-only PDFs correctly fail here rather than
 *  silently producing a quiz from an empty string. */
export async function extractPdfText(buffer: Buffer): Promise<string> {
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
