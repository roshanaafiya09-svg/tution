import { IsIn, IsInt, Min } from 'class-validator';

export const ALLOWED_AVATAR_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export class AvatarUploadUrlDto {
  @IsIn(ALLOWED_AVATAR_MIMES, {
    message: `mime must be one of: ${ALLOWED_AVATAR_MIMES.join(', ')}`,
  })
  mime!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
