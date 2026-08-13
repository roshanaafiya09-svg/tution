import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';

export const ALLOWED_ACADEMY_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const MAX_ACADEMY_IMAGE_BYTES = 5 * 1024 * 1024;

/** Shared by logo, cover, and gallery-photo upload endpoints — `caption`
 *  is only read for the photo endpoint, ignored elsewhere. */
export class AcademyImageUploadUrlDto {
  @IsIn(ALLOWED_ACADEMY_IMAGE_MIMES, {
    message: `mime must be one of: ${ALLOWED_ACADEMY_IMAGE_MIMES.join(', ')}`,
  })
  mime!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string;
}
