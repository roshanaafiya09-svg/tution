import { IsOptional, IsUUID } from 'class-validator';

export class ApproveLeaveDto {
  @IsOptional()
  @IsUUID()
  substituteTutorId?: string;
}

export class AssignSubstituteDto {
  @IsUUID()
  substituteTutorId!: string;
}
