import { IsUUID } from 'class-validator';

export class JoinWaitlistDto {
  @IsUUID()
  tutorSubjectId!: string;
}
