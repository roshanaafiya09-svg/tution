import { IsIn, IsInt, Min } from 'class-validator';

/** PDF/DOC/DOCX per spec §11 — mirrors the existing MIME-allowlist
 *  pattern (materials, submissions). */
export const ALLOWED_QUESTION_PAPER_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const MAX_QUESTION_PAPER_BYTES = 15 * 1024 * 1024;

export class QuestionPaperUploadUrlDto {
  @IsIn(ALLOWED_QUESTION_PAPER_MIMES, {
    message: `mime must be one of: ${ALLOWED_QUESTION_PAPER_MIMES.join(', ')}`,
  })
  mime!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
