import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class ReorderAcademyPhotosDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  photoIds!: string[];
}
