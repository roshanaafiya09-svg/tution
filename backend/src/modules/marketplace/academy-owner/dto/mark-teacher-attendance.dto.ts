import { IsIn, IsUUID } from 'class-validator';

export class MarkTeacherAttendanceDto {
  @IsUUID()
  sessionId!: string;

  @IsIn(['present', 'absent'])
  status!: 'present' | 'absent';
}
