import { IsIn, IsUUID } from 'class-validator';

export class MarkAttendanceDto {
  @IsUUID()
  studentId!: string;

  @IsIn(['present', 'absent', 'late'])
  status!: 'present' | 'absent' | 'late';
}
