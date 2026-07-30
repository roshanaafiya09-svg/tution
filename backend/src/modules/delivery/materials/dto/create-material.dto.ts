import { IsIn, IsInt, IsString, IsUUID, MaxLength, Min } from 'class-validator';

/** Blueprint §4 scopes materials to "PDF/image upload". */
export const ALLOWED_MATERIAL_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const MAX_MATERIAL_BYTES = 25 * 1024 * 1024;

export class CreateMaterialDto {
  @IsUUID()
  batchId!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsIn(ALLOWED_MATERIAL_MIMES, {
    message: `mime must be one of: ${ALLOWED_MATERIAL_MIMES.join(', ')}`,
  })
  mime!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
