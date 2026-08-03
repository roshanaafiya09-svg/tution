import { ForbiddenException, Injectable } from '@nestjs/common';
import { AttendanceRepository } from '../scheduling/attendance/attendance.repository';
import { AssignmentsRepository } from '../assessment/assignments/assignments.repository';
import { QuizAttemptsRepository } from '../assessment/quizzes/attempts/attempts.repository';
import { ParentLinksRepository } from '../parents/parent-links.repository';
import { bucketByWeek, recentWeekStarts, trendDirection } from './week-buckets';

const DEFAULT_WEEKS = 8;
const MAX_WEEKS = 26;

@Injectable()
export class ProgressService {
  constructor(
    private readonly attendanceRepository: AttendanceRepository,
    private readonly assignmentsRepository: AssignmentsRepository,
    private readonly quizAttemptsRepository: QuizAttemptsRepository,
    private readonly parentLinksRepository: ParentLinksRepository,
  ) {}

  forStudent(studentId: string, weeksParam?: number) {
    return this.build(studentId, weeksParam);
  }

  async forParent(parentId: string, studentId: string, weeksParam?: number) {
    const link = await this.parentLinksRepository.findByParentAndStudent(
      parentId,
      studentId,
    );
    if (!link || link.status !== 'active') {
      throw new ForbiddenException('No active consented link to this student');
    }
    return this.build(studentId, weeksParam);
  }

  private async build(studentId: string, weeksParam?: number) {
    const weeks = clampWeeks(weeksParam);
    const weekStarts = recentWeekStarts(weeks);

    const [attendanceRows, assignmentRows, quizRows] = await Promise.all([
      this.attendanceRepository.listForStudent(studentId),
      this.assignmentsRepository.listForStudent(studentId),
      this.quizAttemptsRepository.listForStudent(studentId),
    ]);

    const attendanceBuckets = bucketByWeek(
      attendanceRows,
      (r) => new Date(r.scheduled_start_utc),
      weekStarts,
    );
    const assignmentBuckets = bucketByWeek(
      assignmentRows,
      (r) => new Date(r.due_at_utc),
      weekStarts,
    );
    const quizBuckets = bucketByWeek(
      quizRows,
      (r) => new Date(r.submitted_at),
      weekStarts,
    );

    const weeklyAttendanceRates: (number | null)[] = [];
    const weeklyQuizAverages: (number | null)[] = [];

    const weeklyStats = weekStarts.map((weekStart) => {
      const key = weekStart.toISOString().slice(0, 10);

      const attendance = attendanceBuckets.get(key) ?? [];
      const attendedCount = attendance.filter(
        (a) => a.status === 'present' || a.status === 'late',
      ).length;
      const attendanceRate =
        attendance.length === 0
          ? null
          : Math.round((attendedCount / attendance.length) * 100);
      weeklyAttendanceRates.push(attendanceRate);

      const assignments = assignmentBuckets.get(key) ?? [];
      const submitted = assignments.filter(
        (a) => a.submission_id !== null,
      ).length;
      const graded = assignments.filter((a) => a.grade !== null).length;

      const quizzes = quizBuckets.get(key) ?? [];
      const quizAverage =
        quizzes.length === 0
          ? null
          : Math.round(
              (quizzes.reduce((sum, q) => sum + q.score / q.total, 0) /
                quizzes.length) *
                100,
            );
      weeklyQuizAverages.push(quizAverage);

      return {
        weekStart: key,
        attendance: {
          total: attendance.length,
          present: attendance.filter((a) => a.status === 'present').length,
          late: attendance.filter((a) => a.status === 'late').length,
          absent: attendance.filter((a) => a.status === 'absent').length,
          rate: attendanceRate,
        },
        assignments: { due: assignments.length, submitted, graded },
        quizzes: {
          attempted: quizzes.length,
          averageScorePercent: quizAverage,
        },
      };
    });

    const allAttended = attendanceRows.filter(
      (a) => a.status === 'present' || a.status === 'late',
    ).length;
    const allSubmitted = assignmentRows.filter(
      (a) => a.submission_id !== null,
    ).length;

    return {
      studentId,
      weeks: weeklyStats,
      summary: {
        overallAttendanceRate:
          attendanceRows.length === 0
            ? null
            : Math.round((allAttended / attendanceRows.length) * 100),
        overallAssignmentCompletionRate:
          assignmentRows.length === 0
            ? null
            : Math.round((allSubmitted / assignmentRows.length) * 100),
        overallQuizAverageScorePercent:
          quizRows.length === 0
            ? null
            : Math.round(
                (quizRows.reduce((sum, q) => sum + q.score / q.total, 0) /
                  quizRows.length) *
                  100,
              ),
        attendanceTrend: trendDirection(weeklyAttendanceRates),
        quizTrend: trendDirection(weeklyQuizAverages),
      },
    };
  }
}

function clampWeeks(weeksParam: number | undefined): number {
  if (!weeksParam || !Number.isFinite(weeksParam)) return DEFAULT_WEEKS;
  return Math.min(Math.max(Math.trunc(weeksParam), 1), MAX_WEEKS);
}
