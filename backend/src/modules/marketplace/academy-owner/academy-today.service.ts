import { Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { AcademiesRepository } from '../academies/academies.repository';
import { AcademyMembershipsRepository } from '../academy-memberships/academy-memberships.repository';
import { AcademyContactRequestsRepository } from '../academies/academy-contact-requests.repository';
import { AcademyReviewsService } from '../academy-reviews/academy-reviews.service';
import { BatchesRepository } from '../../scheduling/batches/batches.repository';
import { SessionsRepository } from '../../scheduling/sessions/sessions.repository';
import { AttendanceRepository } from '../../scheduling/attendance/attendance.repository';
import { TeacherLeaveService } from '../../holidays/teacher-leave.service';
import { AssessmentsRepository } from '../../assessments/assessments.repository';
import { AcademyOwnerAssessmentsService } from './academy-owner-assessments.service';

// Same local-constant convention as every other Academy Owner / Holiday /
// Teacher Leave service — see AcademyOwnerAttendanceService's doc comment
// for why this stays a local constant rather than shared config.
const DEFAULT_TIMEZONE = 'Asia/Kolkata';

const RECENT_ACTIVITY_LIMIT = 6;

/**
 * Academy Today's aggregation layer (Academy → Today command center) —
 * the one place that composes existing domain data into the day's
 * overview, class timeline, Needs Attention alerts, a short look-ahead,
 * and recent activity. Deliberately owns no business rules of its own:
 * every number here is either read straight off an existing
 * repository/service result, or a small in-memory derivation of a rule
 * that's already established elsewhere (e.g. a session's own
 * cancellation_reason/substitute_tutor_id, the assessment scheduler's
 * own 'overdue' status, TeacherLeaveService's own status pipeline).
 *
 * Same resolveOwnAcademy(ownerUserId) pattern as every other
 * academy-owner service — an academy admin can never see another
 * academy's Today by construction, since every query below is scoped to
 * this academy's own active tutor ids.
 */
@Injectable()
export class AcademyTodayService {
  constructor(
    private readonly academiesRepository: AcademiesRepository,
    private readonly academyMembershipsRepository: AcademyMembershipsRepository,
    private readonly academyContactRequestsRepository: AcademyContactRequestsRepository,
    private readonly academyReviewsService: AcademyReviewsService,
    private readonly batchesRepository: BatchesRepository,
    private readonly sessionsRepository: SessionsRepository,
    private readonly attendanceRepository: AttendanceRepository,
    private readonly teacherLeaveService: TeacherLeaveService,
    private readonly assessmentsRepository: AssessmentsRepository,
    private readonly academyOwnerAssessmentsService: AcademyOwnerAssessmentsService,
  ) {}

  private async resolveOwnAcademy(ownerUserId: string) {
    const academy =
      await this.academiesRepository.findByOwnerUserId(ownerUserId);
    if (!academy) {
      throw new NotFoundException('No academy is linked to this account yet');
    }
    return academy;
  }

  async getToday(ownerUserId: string) {
    const academy = await this.resolveOwnAcademy(ownerUserId);

    const now = DateTime.now().setZone(DEFAULT_TIMEZONE);
    const today = now.toISODate()!;
    const tomorrow = now.plus({ days: 1 }).toISODate()!;
    const todayStart = now.startOf('day').toJSDate();
    const todayEnd = now.endOf('day').toJSDate();
    const tomorrowStart = now.plus({ days: 1 }).startOf('day').toJSDate();
    const tomorrowEnd = now.plus({ days: 1 }).endOf('day').toJSDate();

    const activeTeachers =
      await this.academyMembershipsRepository.listActiveForAcademy(academy.id);
    const tutorIds = activeTeachers.map((t) => t.tutor_id);
    // Names also cover teachers who have since left (historical classes).
    const tutorNames =
      await this.academyMembershipsRepository.displayNamesForAcademy(
        academy.id,
      );

    const [
      todaySessions,
      tomorrowSessions,
      batches,
      leaveRequests,
      contactRequests,
      { reviews },
      todayAssessments,
      tomorrowAssessments,
      overdueScorecards,
      weeklyCompliance,
    ] = await Promise.all([
      this.sessionsRepository.listForAcademyBetween(
        academy.id,
        todayStart,
        todayEnd,
      ),
      this.sessionsRepository.listForAcademyBetween(
        academy.id,
        tomorrowStart,
        tomorrowEnd,
      ),
      this.batchesRepository.listForAcademy(academy.id),
      this.teacherLeaveService.listAllForAcademy(academy.id),
      this.academyContactRequestsRepository.listForAcademy(academy.id),
      this.academyReviewsService.listForAcademy(academy.id),
      this.assessmentsRepository.listForAcademyOnDate(academy.id, today),
      this.assessmentsRepository.listForAcademyOnDate(academy.id, tomorrow),
      this.assessmentsRepository.listOverdueForAcademy(academy.id),
      this.academyOwnerAssessmentsService.getWeeklyCompliance(ownerUserId),
    ]);

    const enrolledByBatch = new Map(
      batches.map((b) => [b.id, Number(b.enrolled_count)]),
    );

    const activeTodaySessions = todaySessions.filter(
      (s) => s.status !== 'cancelled',
    );
    const cancelledTodaySessions = todaySessions.filter(
      (s) => s.status === 'cancelled',
    );
    const todayBatchIds = [
      ...new Set(activeTodaySessions.map((s) => s.batch_id)),
    ];
    const todayAttendanceRows =
      todayBatchIds.length > 0
        ? await this.attendanceRepository.listForBatches(todayBatchIds)
        : [];
    const sessionIdsWithAttendance = new Set(
      todayAttendanceRows.map((r) => r.session_id),
    );

    const activeAssessmentsToday = todayAssessments.filter(
      (a) => a.status !== 'draft',
    );
    const activeAssessmentsTomorrow = tomorrowAssessments.filter(
      (a) => a.status !== 'draft',
    );

    const approvedLeaveCoveringDate = (date: string) =>
      new Set(
        leaveRequests
          .filter(
            (r) =>
              r.status === 'approved' &&
              r.start_date <= date &&
              r.end_date >= date,
          )
          .map((r) => r.tutor_id),
      );
    const teachersOnLeaveToday = approvedLeaveCoveringDate(today);
    const teachersOnLeaveTomorrow = approvedLeaveCoveringDate(tomorrow);

    const overview = {
      classesToday: activeTodaySessions.length,
      classesCancelledToday: cancelledTodaySessions.length,
      attendanceRecordedCount: activeTodaySessions.filter((s) =>
        sessionIdsWithAttendance.has(s.id),
      ).length,
      teachersActive: tutorIds.length,
      teachersOnLeaveToday: teachersOnLeaveToday.size,
      assessmentsToday: activeAssessmentsToday.length,
    };

    const classes = [...todaySessions]
      .sort(
        (a, b) =>
          new Date(a.scheduled_start_utc).getTime() -
          new Date(b.scheduled_start_utc).getTime(),
      )
      .map((s) => ({
        id: s.id,
        batchId: s.batch_id,
        batchTitle: s.batch_title,
        subjectId: s.subject_id,
        tutorId: s.tutor_id,
        tutorDisplayName: tutorNames.get(s.tutor_id) ?? null,
        scheduledStartUtc: s.scheduled_start_utc,
        timezone: s.timezone,
        durationMin: s.duration_min,
        status: s.status,
        cancellationReason: s.cancellation_reason,
        substituteTutorId: s.substitute_tutor_id,
        substituteDisplayName: s.substitute_display_name,
        enrolledCount: enrolledByBatch.get(s.batch_id) ?? 0,
        attendanceRecorded: sessionIdsWithAttendance.has(s.id),
      }));

    // A completed, non-cancelled class is the only case attendance is
    // actually expected for — a cancelled session never gets attendance
    // rows (AttendanceService's own invariant) and a not-yet-run session
    // simply hasn't happened yet, so neither counts as "missing".
    const missingAttendanceCount = activeTodaySessions.filter(
      (s) => s.status === 'completed' && !sessionIdsWithAttendance.has(s.id),
    ).length;

    const pendingLeaveCount = leaveRequests.filter(
      (r) => r.status === 'pending',
    ).length;
    const pendingContactRequestCount = contactRequests.filter(
      (r) => r.status === 'new',
    ).length;

    const needsAttention = {
      pendingLeaveRequests: pendingLeaveCount,
      overdueScorecards: overdueScorecards.length,
      missingAttendance: missingAttendanceCount,
      pendingContactRequests: pendingContactRequestCount,
      teachersWithoutWeeklyAssessment: weeklyCompliance.summary.notScheduled,
    };

    const upcoming = {
      date: tomorrow,
      classes: tomorrowSessions.filter((s) => s.status !== 'cancelled').length,
      assessments: activeAssessmentsTomorrow.length,
      teacherLeave: teachersOnLeaveTomorrow.size,
    };

    const recentActivity = {
      activeTeachers: [...activeTeachers]
        .sort(
          (a, b) =>
            new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime(),
        )
        .slice(0, RECENT_ACTIVITY_LIMIT)
        .map((t) => ({
          membershipId: t.membership_id,
          tutorId: t.tutor_id,
          displayName: t.display_name,
          joinedAt: t.joined_at,
        })),
      contactRequests: contactRequests
        .slice(0, RECENT_ACTIVITY_LIMIT)
        .map((r) => ({
          id: r.id,
          studentDisplayName: r.student_display_name,
          createdAt: r.created_at,
          readAt: r.read_at,
        })),
      reviews: reviews.slice(0, RECENT_ACTIVITY_LIMIT).map((r) => ({
        id: r.id,
        studentDisplayName: r.student_display_name,
        rating: r.rating,
        createdAt: r.created_at,
      })),
      batches: [...batches]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .slice(0, RECENT_ACTIVITY_LIMIT)
        .map((b) => ({
          id: b.id,
          title: b.title,
          tutorDisplayName: tutorNames.get(b.tutor_id) ?? null,
          createdAt: b.created_at,
        })),
      leaveRequests: [...leaveRequests]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .slice(0, RECENT_ACTIVITY_LIMIT)
        .map((r) => ({
          id: r.id,
          tutorDisplayName: r.tutor_display_name,
          status: r.status,
          startDate: r.start_date,
          endDate: r.end_date,
          createdAt: r.created_at,
        })),
    };

    return {
      date: today,
      overview,
      classes,
      needsAttention,
      upcoming,
      recentActivity,
    };
  }
}
