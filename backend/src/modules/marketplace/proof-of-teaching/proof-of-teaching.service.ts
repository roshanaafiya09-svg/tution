import { Injectable } from '@nestjs/common';
import { AttendanceRepository } from '../../scheduling/attendance/attendance.repository';
import { SessionsRepository } from '../../scheduling/sessions/sessions.repository';
import { BatchesRepository } from '../../scheduling/batches/batches.repository';
import { QuizAttemptsRepository } from '../../assessment/quizzes/attempts/attempts.repository';
import { BookingsService } from '../bookings/bookings.service';
import {
  bucketByWeek,
  recentWeekStarts,
  trendDirection,
} from '../../progress/week-buckets';

const TREND_WEEKS = 8;
const VERIFIED_HOURS_CAP = 200;
const IMPROVEMENT_SCORE: Record<'up' | 'flat' | 'down', number> = {
  up: 100,
  flat: 60,
  down: 20,
};

/**
 * The discovery-ranking signal for Phase 4 (blueprint §10): "verified
 * hours, attendance retention, measured improvement." Built entirely
 * from data that already exists for other features — no table of its
 * own. Weights (0.4/0.3/0.3), the 200-hour normalization cap, and the
 * up/flat/down -> 100/60/20 mapping are judgment calls; the blueprint
 * names the three inputs but not a formula.
 */
@Injectable()
export class ProofOfTeachingService {
  constructor(
    private readonly sessionsRepository: SessionsRepository,
    private readonly attendanceRepository: AttendanceRepository,
    private readonly quizAttemptsRepository: QuizAttemptsRepository,
    private readonly batchesRepository: BatchesRepository,
    private readonly bookingsService: BookingsService,
  ) {}

  /** Distinct students taught — batch enrollments (ever, not just
   *  active) unioned with completed 1:1 bookings, deduplicated in case
   *  the same student appears in both. No table of its own, same
   *  "derived signal" shape as the rest of this service. */
  async countStudentsTaught(tutorId: string): Promise<number> {
    const [batchStudentIds, bookingStudentIds] = await Promise.all([
      this.batchesRepository.listDistinctStudentIdsForTutor(tutorId),
      this.bookingsService.listDistinctCompletedStudentIds(tutorId),
    ]);
    return new Set([...batchStudentIds, ...bookingStudentIds]).size;
  }

  async scoreForTutor(tutorId: string) {
    const [completedMinutes, attendance, quizAttempts, studentsTaught] =
      await Promise.all([
        this.sessionsRepository.sumCompletedMinutesForTutor(tutorId),
        this.attendanceRepository.summaryForTutor(tutorId),
        this.quizAttemptsRepository.listForTutor(tutorId),
        this.countStudentsTaught(tutorId),
      ]);

    const verifiedHours = completedMinutes / 60;
    const verifiedHoursScore = Math.min(
      100,
      (verifiedHours / VERIFIED_HOURS_CAP) * 100,
    );
    const attendanceRetentionScore = attendance.rate ?? 0;

    const weekStarts = recentWeekStarts(TREND_WEEKS);
    const quizBuckets = bucketByWeek(
      quizAttempts,
      (r) => new Date(r.submitted_at),
      weekStarts,
    );
    const weeklyQuizAverages = weekStarts.map((weekStart) => {
      const key = weekStart.toISOString().slice(0, 10);
      const quizzes = quizBuckets.get(key) ?? [];
      if (quizzes.length === 0) return null;
      return Math.round(
        (quizzes.reduce((sum, q) => sum + q.score / q.total, 0) /
          quizzes.length) *
          100,
      );
    });
    const quizTrend = trendDirection(weeklyQuizAverages);
    const improvementScore = IMPROVEMENT_SCORE[quizTrend];

    const score = Math.round(
      0.4 * verifiedHoursScore +
        0.3 * attendanceRetentionScore +
        0.3 * improvementScore,
    );

    return {
      tutorId,
      score,
      studentsTaught,
      inputs: {
        verifiedHours: Math.round(verifiedHours * 10) / 10,
        attendanceRetentionRate: attendance.rate,
        quizImprovementTrend: quizTrend,
      },
    };
  }
}
