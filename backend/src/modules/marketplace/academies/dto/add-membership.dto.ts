import { IsUUID } from 'class-validator';

export class AddMembershipDto {
  @IsUUID()
  tutorId!: string;
}
