import { IsIn, IsInt, Min } from 'class-validator';

/** Blueprint §4: "Aadhaar-masked ID + qualification upload". */
export const VERIFICATION_DOCUMENT_TYPES = [
  'id_proof',
  'qualification',
] as const;
export type VerificationDocumentType =
  (typeof VERIFICATION_DOCUMENT_TYPES)[number];

export const ALLOWED_VERIFICATION_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;

export const MAX_VERIFICATION_BYTES = 10 * 1024 * 1024;

export class CreateVerificationUploadDto {
  @IsIn(VERIFICATION_DOCUMENT_TYPES, {
    message: `type must be one of: ${VERIFICATION_DOCUMENT_TYPES.join(', ')}`,
  })
  type!: VerificationDocumentType;

  @IsIn(ALLOWED_VERIFICATION_MIMES, {
    message: `mime must be one of: ${ALLOWED_VERIFICATION_MIMES.join(', ')}`,
  })
  mime!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
